import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, InteractionManager,
  ActivityIndicator, Image, ScrollView, SafeAreaView, StatusBar, Dimensions, Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

// --- CONFIGURATION ---
const BASE_URL = "http://192.168.1.88:8000";
const BACKEND_URL = `${BASE_URL}/analyze`;
const VOICE_COMMAND_URL = `${BASE_URL}/voice-command`;

const { width } = Dimensions.get('window');
const CARD_SIZE = (width - 48) / 2;

// --- DANH SACH CHUC NANG ---
const FEATURES = [
  { id: 'find_object',       title: 'Dò tìm vật thể',        icon: '🔍', color: '#4A90E2' },
  { id: 'avoid_obstacle',    title: 'Tránh vật cản',          icon: '🛡️', color: '#27AE60' },
  { id: 'recognize_money',   title: 'Phân loại mệnh tiền',    icon: '💵', color: '#F39C12' },
  { id: 'describe_scene',    title: 'Mô tả cảnh vật',         icon: '🖼️', color: '#8E44AD' },
  { id: 'read_text',         title: 'Nhận diện văn bản',      icon: '📄', color: '#E67E22' },
  { id: 'recognize_product', title: 'Nhận diện sản phẩm',     icon: '📦', color: '#16A085' },
];

// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  const [currentScreen, setCurrentScreen] = useState('home');
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [resultText, setResultText] = useState('');
  const [capturedImage, setCapturedImage] = useState(null);
  const [isOCRMode, setIsOCRMode] = useState(false);
  const cameraRef = useRef(null);
  const recordingRef = useRef(null);

  useEffect(() => {
    // delay startup speech to ensure engine is ready
    setTimeout(() => {
      speakMessage('Hỗ trợ người khiếm thị. Chọn chức năng bạn muốn sử dụng.');
    }, 1500);
    
    // request permissions after speech starts
    setTimeout(() => {
      requestPermission();
    }, 2500);
  }, []);

  const currentSoundRef = useRef(null);

  // ---- SPEAK HELPER (SỬ DỤNG SERVER ĐỂ CÓ GIỌNG GOOGLE CHUẨN) ----
  const speakMessage = useCallback(async (message) => {
    try {
      if (currentSoundRef.current) {
        await currentSoundRef.current.unloadAsync();
        currentSoundRef.current = null;
      }
      const url = `${BASE_URL}/tts?text=${encodeURIComponent(message)}`;
      const { sound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true }
      );
      currentSoundRef.current = sound;
      
      sound.setOnPlaybackStatusUpdate(async (status) => {
        if (status.didJustFinish) {
          await sound.unloadAsync();
          if (currentSoundRef.current === sound) {
            currentSoundRef.current = null;
          }
        }
      });
    } catch (e) {
      console.log('Loi doc TTS:', e);
    }
  }, []);

  // ---- AUDIO PLAYBACK ----
  const playAudioBase64 = async (base64Str) => {
    try {
      if (currentSoundRef.current) {
        await currentSoundRef.current.unloadAsync();
        currentSoundRef.current = null;
      }
      const fileUri = `${FileSystem.cacheDirectory}speech.mp3`;
      await FileSystem.writeAsStringAsync(fileUri, base64Str, { encoding: 'base64' });
      
      const { sound } = await Audio.Sound.createAsync(
        { uri: fileUri },
        { shouldPlay: true }
      );
      
      currentSoundRef.current = sound;
      
      sound.setOnPlaybackStatusUpdate(async (status) => {
        if (status.didJustFinish) {
          await sound.unloadAsync();
          await FileSystem.deleteAsync(fileUri, { idempotent: true });
          if (currentSoundRef.current === sound) {
            currentSoundRef.current = null;
          }
        }
      });
    } catch (error) {
      console.error('Loi phat audio:', error);
    }
  };

  const handleMicPress = useCallback(async () => {
    if (isRecording || isProcessing) return;
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        speakMessage('Cần quyền micro để điều khiển bằng giọng nói');
        return;
      }
      
      // Step 1: Announcement
      await speakMessage('Bắt đầu ghi âm lệnh');
      
      // Wait for speech to finish before recording (approx 2 seconds)
      setTimeout(async () => {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        setIsRecording(true);

        const { recording } = await Audio.Recording.createAsync({
          android: { extension: '.m4a', outputFormat: 2, audioEncoder: 3, sampleRate: 16000, numberOfChannels: 1, bitRate: 128000 },
          ios: { extension: '.m4a', outputFormat: Audio.IOSOutputFormat.MPEG4AAC, audioQuality: Audio.IOSAudioQuality.HIGH, sampleRate: 16000, numberOfChannels: 1, bitRate: 128000 },
          web: {},
        });
        recordingRef.current = recording;

        setTimeout(() => {
          if (recordingRef.current) stopAndProcessRecording();
        }, 4000);
      }, 2000);

    } catch (error) {
      console.error('Loi ghi am:', error);
      setIsRecording(false);
      await speakMessage('Có lỗi micro');
    }
  }, [isRecording, isProcessing, speakMessage]);

  const stopAndProcessRecording = async () => {
    try {
      setIsRecording(false);
      const recording = recordingRef.current;
      if (!recording) return;
      recordingRef.current = null;

      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      if (!uri) return;

      await speakMessage('Đang xử lý...');

      const formData = new FormData();
      formData.append('file', {
        uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
        name: 'voice.m4a',
        type: 'audio/m4a'
      });

      const response = await fetch(VOICE_COMMAND_URL, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
        },
      });
      const result = await response.json();
      console.log('[Voice] Ket qua:', result);

      if (result.status === 'success') {
        routeCommand(result.command);
      } else if (result.status === 'no_speech' || result.command === 'unknown') {
        speakMessage('Không nghe rõ, vui lòng nói lại');
        // Automatically restart flow after message
        setTimeout(() => {
          handleMicPress();
        }, 3000);
      } else {
        speakMessage('Không hiểu lệnh, thử lại');
      }
    } catch (error) {
      console.error('Loi xu ly giong noi:', error);
      await speakMessage('Lỗi kết nối máy chủ');
      setIsRecording(false);
    }
  };

  const routeCommand = (command) => {
    console.log(`[Voice] Chuyen den: ${command}`);
    const feature = FEATURES.find(f => f.id === command);
    if (feature) {
      setCurrentScreen(command);
      setIsOCRMode(command === 'read_text');
      speakMessage(`Mở chức năng ${feature.title}`);
    } else {
      speakMessage('Chức năng không tìm thấy');
    }
  };

  // ============================================================
  // CAMERA / DESCRIBE SCENE PIPELINE
  // ============================================================
  const handleScreenPress = useCallback(() => {
    if (isProcessing || isRecording) return;
    InteractionManager.runAfterInteractions(() => startAnalysisProcess());
  }, [isProcessing, isRecording, isOCRMode]);

  const startAnalysisProcess = async () => {
    if (!cameraRef.current) return;
    try {
      setIsProcessing(true);
      setResultText('');
      setCapturedImage(null);

      await new Promise(resolve => setTimeout(resolve, 800));
      const photo = await cameraRef.current.takePictureAsync({ quality: 1.0, base64: false, shutterSound: false });
      setCapturedImage(photo.uri);

      const formData = new FormData();
      formData.append('file', { uri: photo.uri, name: 'image.jpg', type: 'image/jpeg' });

      const url = isOCRMode ? `${BACKEND_URL}?mode=ocr` : BACKEND_URL;
      const response = await fetch(url, { method: 'POST', body: formData, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('API loi: ' + response.status);

      const result = await response.json();
      console.log('[AI]', { status: result.status, vietnamese: result.vietnamese, audio_base64: result.audio_base64 ? '[HIDDEN]' : null });

      if (result.status === 'success' && result.vietnamese) {
        setResultText(result.vietnamese);
        if (result.audio_base64) await playAudioBase64(result.audio_base64);
        else speakMessage(result.vietnamese);
      } else {
        const msg = 'Không thể nhận diện được.';
        setResultText(msg);
        speakMessage(msg);
      }
    } catch (error) {
      console.error(error);
      const msg = 'Mất kết nối mạng, thử lại.';
      setResultText(msg);
      speakMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // ============================================================
  // RENDER: NAVIGATION
  // ============================================================
  if (currentScreen === 'describe_scene') {
    return (
      <DescribeSceneScreen
        permission={permission}
        requestPermission={requestPermission}
        cameraRef={cameraRef}
        capturedImage={capturedImage}
        isProcessing={isProcessing}
        isRecording={isRecording}
        resultText={resultText}
        onPress={handleScreenPress}
        onBack={() => { setCurrentScreen('home'); setResultText(''); setCapturedImage(null); setIsOCRMode(false); }}
        onMicPress={handleMicPress}
      />
    );
  }

  if (currentScreen === 'read_text') {
    return (
      <DescribeSceneScreen
        permission={permission}
        requestPermission={requestPermission}
        cameraRef={cameraRef}
        capturedImage={capturedImage}
        isProcessing={isProcessing}
        isRecording={isRecording}
        resultText={resultText}
        onPress={handleScreenPress}
        onBack={() => { setCurrentScreen('home'); setResultText(''); setCapturedImage(null); setIsOCRMode(false); }}
        onMicPress={handleMicPress}
        isOCR={true}
      />
    );
  }

  if (currentScreen !== 'home') {
    const feature = FEATURES.find(f => f.id === currentScreen);
    return (
      <ComingSoonScreen
        feature={feature}
        onBack={() => setCurrentScreen('home')}
        isRecording={isRecording}
        onMicPress={handleMicPress}
      />
    );
  }

  // HOME SCREEN
  return (
    <HomeScreen
      features={FEATURES}
      onFeaturePress={(id) => {
        setCurrentScreen(id);
        setIsOCRMode(id === 'read_text');
      }}
      isRecording={isRecording}
      onMicPress={handleMicPress}
    />
  );
}

// ============================================================
// HOME SCREEN COMPONENT
// ============================================================
function HomeScreen({ features, onFeaturePress, isRecording, onMicPress }) {
  return (
    <SafeAreaView style={homeStyles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F6FA" />
      {/* Header */}
      <View style={homeStyles.header}>
        <Text style={homeStyles.headerTitle}>Hỗ trợ người khiếm thị</Text>
        <Text style={homeStyles.headerSub}>Chọn chức năng bạn muốn sử dụng</Text>
      </View>

      {/* Feature Grid */}
      <ScrollView contentContainerStyle={homeStyles.grid} showsVerticalScrollIndicator={false}>
        {features.map((feat) => (
          <TouchableOpacity
            key={feat.id}
            style={[homeStyles.card, { backgroundColor: feat.color }]}
            onPress={() => onFeaturePress(feat.id)}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={feat.title}
            accessibilityHint={`Bấm để mở chức năng ${feat.title}`}
          >
            <Text style={homeStyles.cardIcon}>{feat.icon}</Text>
            <Text style={homeStyles.cardTitle}>{feat.title}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Bottom Navigation */}
      <BottomNav isRecording={isRecording} onMicPress={onMicPress} showMic={true} />
    </SafeAreaView>
  );
}

// ============================================================
// DESCRIBE SCENE SCREEN COMPONENT
// ============================================================
function DescribeSceneScreen({ permission, requestPermission, cameraRef, capturedImage, isProcessing, isRecording, resultText, onPress, onBack, onMicPress, isOCR }) {
  if (!permission) return <View style={camStyles.container} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={camStyles.container}>
        <Text style={camStyles.infoText}>Cần quyền Camera để mô tả cảnh vật.</Text>
        <TouchableOpacity onPress={requestPermission} style={camStyles.permBtn}>
          <Text style={camStyles.permBtnText}>Cho phép Camera</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={camStyles.container}>
      <TouchableOpacity
        style={StyleSheet.absoluteFillObject}
        activeOpacity={0.9}
        onPress={onPress}
        accessible={true}
        accessibilityRole="button"
        accessibilityHint={isProcessing ? 'Đang xử lý' : 'Chạm màn hình để chụp và mô tả cảnh vật'}
      >
        <CameraView style={StyleSheet.absoluteFillObject} facing="back" ref={cameraRef} />
        {capturedImage && <Image source={{ uri: capturedImage }} style={StyleSheet.absoluteFillObject} />}

        {/* Overlay Text */}
        <View style={camStyles.overlay}>
          {isProcessing ? (
            <>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={camStyles.hugeText}>ĐANG XỬ LÝ...</Text>
            </>
          ) : resultText ? (
            <>
              <Text style={camStyles.resultText}>{resultText}</Text>
              <Text style={camStyles.hint}>Chạm màn hình để chụp tiếp</Text>
            </>
          ) : isRecording ? (
            <Text style={camStyles.hugeText}>🎙️ ĐANG NGHE...</Text>
          ) : (
            <Text style={[camStyles.hugeText, isOCR && { color: '#00BFFF' }]}>
              {isOCR ? 'BẤM ĐỂ ĐỌC CHỮ' : 'CHẠM BẤT KỲ ĐÂU ĐỂ CHỤP'}
            </Text>
          )}
        </View>
      </TouchableOpacity>

      {/* Back Button */}
      <TouchableOpacity style={camStyles.backBtn} onPress={onBack} accessibilityRole="button" accessibilityLabel="Quay lai trang chu">
        <Text style={camStyles.backBtnText}>← Quay lại</Text>
      </TouchableOpacity>

      {/* Back Button */}
      <TouchableOpacity style={camStyles.backBtn} onPress={onBack} accessibilityRole="button" accessibilityLabel="Quay lai trang chu">
        <Text style={camStyles.backBtnText}>← Quay lại</Text>
      </TouchableOpacity>
    </View>
  );
}

// ============================================================
// COMING SOON SCREEN COMPONENT
// ============================================================
function ComingSoonScreen({ feature, onBack, isRecording, onMicPress }) {
  return (
    <SafeAreaView style={[soonStyles.container, { backgroundColor: feature?.color + '15' }]}>
      <StatusBar barStyle="dark-content" />
      {/* Header */}
      <View style={[soonStyles.header, { backgroundColor: feature?.color }]}>
        <TouchableOpacity onPress={onBack} style={soonStyles.backBtn}>
          <Text style={soonStyles.backText}>← Quay lại</Text>
        </TouchableOpacity>
        <Text style={soonStyles.headerTitle}>{feature?.title}</Text>
      </View>

      {/* Content */}
      <View style={soonStyles.content}>
        <Text style={soonStyles.icon}>{feature?.icon}</Text>
        <Text style={soonStyles.title}>Đang phát triển</Text>
        <Text style={soonStyles.subtitle}>Chức năng "{feature?.title}" đang được phát triển và sẽ sớm ra mắt.</Text>
        <TouchableOpacity style={[soonStyles.btn, { backgroundColor: feature?.color }]} onPress={onBack}>
          <Text style={soonStyles.btnText}>Quay về Trang chủ</Text>
        </TouchableOpacity>
      </View>

      <BottomNav isRecording={isRecording} onMicPress={onMicPress} showMic={false} />
    </SafeAreaView>
  );
}

// ============================================================
// BOTTOM NAVIGATION COMPONENT
// ============================================================
function BottomNav({ isRecording, onMicPress, showMic }) {
  return (
    <View style={navStyles.container}>
      <TouchableOpacity style={navStyles.navItem} accessibilityRole="button" accessibilityLabel="Trang chủ">
        <Text style={navStyles.navIcon}>🏠</Text>
        <Text style={navStyles.navLabel}>Trang chủ</Text>
      </TouchableOpacity>

      {showMic && (
        <TouchableOpacity
          style={[navStyles.micBtn, isRecording && navStyles.micBtnRecording]}
          onPress={onMicPress}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={isRecording ? 'Đang ghi âm' : 'Điều khiển bằng giọng nói'}
          accessibilityHint="Bấm và nói tên chức năng muốn mở"
        >
          <Text style={navStyles.micIcon}>{isRecording ? '🔴' : '🎤'}</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={navStyles.navItem} accessibilityRole="button" accessibilityLabel="Hồ sơ">
        <Text style={navStyles.navIcon}>👤</Text>
        <Text style={navStyles.navLabel}>Hồ sơ</Text>
      </TouchableOpacity>
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================
const homeStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F6FA' },
  header: {
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#ECECEC',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#1A1A2E' },
  headerSub: { fontSize: 14, color: '#666', marginTop: 4 },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    padding: 16, gap: 16,
    paddingBottom: 100,
  },
  card: {
    width: CARD_SIZE, height: CARD_SIZE,
    borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
    elevation: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6,
  },
  cardIcon: { fontSize: 40, marginBottom: 12 },
  cardTitle: { fontSize: 15, color: '#FFFFFF', fontWeight: '700', textAlign: 'center', paddingHorizontal: 8 },
});

const camStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  hugeText: { fontSize: 26, color: '#FFFF00', fontWeight: '900', textAlign: 'center', lineHeight: 38 },
  resultText: { fontSize: 30, color: '#00FF00', fontWeight: '900', textAlign: 'center', lineHeight: 42, paddingHorizontal: 12 },
  hint: { fontSize: 16, color: '#FFF', marginTop: 20, opacity: 0.7 },
  infoText: { fontSize: 22, color: '#FFF', textAlign: 'center', margin: 40 },
  permBtn: { backgroundColor: '#FFEB3B', paddingVertical: 16, marginHorizontal: 40, borderRadius: 12, alignItems: 'center' },
  permBtnText: { fontSize: 20, color: '#000', fontWeight: '800' },
  backBtn: {
    position: 'absolute', top: 50, left: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    zIndex: 10,
  },
  backBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  micButton: {
    position: 'absolute', bottom: 40, alignSelf: 'center',
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.90)',
    justifyContent: 'center', alignItems: 'center',
    elevation: 8, zIndex: 10,
  },
  micButtonRecording: { backgroundColor: 'rgba(220,50,50,0.95)' },
  micIcon: { fontSize: 32 },
});

const soonStyles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 50, paddingBottom: 20, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center',
  },
  backBtn: { marginRight: 12 },
  backText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  icon: { fontSize: 80, marginBottom: 24 },
  title: { fontSize: 26, fontWeight: '800', color: '#333', marginBottom: 12 },
  subtitle: { fontSize: 16, color: '#666', textAlign: 'center', lineHeight: 24 },
  btn: { marginTop: 32, paddingVertical: 16, paddingHorizontal: 32, borderRadius: 14 },
  btnText: { color: '#FFF', fontSize: 18, fontWeight: '800' },
});

const navStyles = StyleSheet.create({
  container: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 100, backgroundColor: '#FFFFFF',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    borderTopWidth: 1, borderTopColor: '#ECECEC',
    paddingBottom: 25,
    elevation: 10,
  },
  navItem: { alignItems: 'center', flex: 1 },
  navIcon: { fontSize: 24 },
  navLabel: { fontSize: 12, color: '#666', marginTop: 2 },
  micBtn: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#7B2FBE',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
    elevation: 6,
    shadowColor: '#7B2FBE', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8,
  },
  micBtnRecording: { backgroundColor: '#DC3545' },
  micIcon: { fontSize: 28 },
});