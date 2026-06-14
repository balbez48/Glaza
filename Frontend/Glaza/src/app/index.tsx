import React, { useRef, useState, useEffect } from 'react';
import { View, StyleSheet, Text, Button, TouchableOpacity, Modal, AppState, AppStateStatus, ScrollView } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Slider from '@react-native-community/slider';
import { sendPhotoToBack } from '../services/api';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import Ionicons from '@expo/vector-icons/Ionicons';

export default function MainWindow() {
    const cameraRef = useRef<CameraView>(null);
    const [permission, requestPermission] = useCameraPermissions();
    const [description, setDescription] = useState<string | null>(null);

    // Состояния загрузки под каждый режим
    const [isLoadingScene, setIsLoadingScene] = useState<boolean>(false);
    const [isLoadingText, setIsLoadingText] = useState<boolean>(false);
    const [isLoadingMoney, setIsLoadingMoney] = useState<boolean>(false);

    // Настройки
    const [isSettingsVisible, setIsSettingsVisible] = useState<boolean>(false);
    const [backendSelection, setBackendSelection] = useState<'yandex_sber_split' | 'yandex_only'>('yandex_sber_split');
    const [speechRate, setSpeechRate] = useState<number>(1.0);
    const [availableVoices, setAvailableVoices] = useState<Speech.Voice[]>([]);
    const [selectedVoice, setSelectedVoice] = useState<string | null>(null);
    const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
    const [isFlashActive, setIsFlashActive] = useState<boolean>(false);

    useEffect(() => {
        async function loadVoices() {
            try {
                const voices = await Speech.getAvailableVoicesAsync();
                const ruVoices = voices.filter(voice => voice.language.startsWith('ru'));
                setAvailableVoices(ruVoices);
                if (ruVoices.length > 0) setSelectedVoice(ruVoices[0].identifier);
            } catch (e) { console.error(e); }
        }
        loadVoices();

        const subscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            subscription.remove();
        };
    }, []);

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
        if (nextAppState === 'inactive' || nextAppState === 'background') {
            stopSpeech();
        }
    };

    if (!permission) return <View style={styles.container}><Text style={styles.errorText}>Запрос разрешения...</Text></View>;
    if (!permission.granted) {
        return (
            <View style={styles.container}>
                <Text style={styles.errorText}>Нет доступа к камере</Text>
                <Button title="Запросить разрешение" onPress={requestPermission} />
            </View>
        );
    }

    const speechOptions = {
        language: 'ru',
        rate: speechRate,
        voice: selectedVoice || undefined,
        onStart: () => setIsSpeaking(true),
        onDone: () => setIsSpeaking(false),
        onStopped: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
    };

    function stopSpeech() {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Speech.stop();
        setIsSpeaking(false);
    }

    function handleRepeatOrStop() {
        if (isSpeaking) {
            stopSpeech();
        } else {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            Speech.speak(description || "Предыдущее описание отсутствует", speechOptions);
        }
    }

    function handleRateChange(value: number) {
        const roundedValue = Math.round(value * 10) / 10;
        setSpeechRate(roundedValue);
    }

    // Обработка клика на заблокированную "Среду"
    function handleDisabledScenePress() {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Speech.stop();
        Speech.speak("Режим описания обстановки недоступен в резервном контуре Яндекс", speechOptions);
    }

    function confirmRateChange() {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        Speech.speak(`Скорость ${speechRate}`, { language: 'ru', rate: speechRate, voice: selectedVoice || undefined });
    }

    type VoiceChangeHandler = (voiceId: string, friendlyName: string) => void;
    const changeVoice: VoiceChangeHandler = (voiceId, friendlyName) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setSelectedVoice(voiceId);
        Speech.speak(`Выбран ${friendlyName}`, { language: 'ru', rate: speechRate, voice: voiceId });
    };

    function closeSettings() {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setIsSettingsVisible(false);
        Speech.speak("Настройки сохранены", { language: 'ru', rate: speechRate, voice: selectedVoice || undefined });
    }

    function toggleBackend(mode: 'yandex_sber_split' | 'yandex_only', text: string) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setBackendSelection(mode);
        Speech.speak(`Выбран режим: ${text}`, { language: 'ru', rate: speechRate, voice: selectedVoice || undefined });
    }

    async function sendPicture(mode: 'scene' | 'text' | 'money') {
        const isAnyLoading = isLoadingScene || isLoadingText || isLoadingMoney;
        if (!cameraRef.current || isAnyLoading) return;

        // Дополнительная проверка безопасности на случай обхода UI
        if (backendSelection === 'yandex_only' && mode === 'scene') {
            handleDisabledScenePress();
            return;
        }

        try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            Speech.stop();
            setDescription(null);

            if (mode === 'scene') {
                setIsLoadingScene(true);
                Speech.speak("Анализирую обстановку", speechOptions);
            }
            else if (mode === 'text') {
                setIsLoadingText(true);
                Speech.speak("Читаю текст", speechOptions);
            }
            else if (mode === 'money') {
                setIsLoadingMoney(true);
                Speech.speak("Определяю номинал купюры", speechOptions);
            }

            const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });

            if (photo && photo.uri) {
                const answer = await sendPhotoToBack(photo, mode);
                if (answer && answer.description) {
                    setDescription(answer.description);
                    Speech.speak(answer.description, speechOptions);
                }
            }
        } catch (err) {
            console.error(err);
            Speech.speak("Произошла ошибка при соединении с сервером", speechOptions);
        } finally {
            setIsLoadingScene(false);
            setIsLoadingText(false);
            setIsLoadingMoney(false);
        }
    }

    function toggleFlash() {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const nextState = !isFlashActive;
        setIsFlashActive(nextState);
        Speech.speak(nextState ? "Фонарик включен" : "Фонарик выключен", speechOptions);
    }

    const isYandexOnly = backendSelection === 'yandex_only';

    return (
        <View style={styles.container}>
            <CameraView
                ref={cameraRef}
                style={styles.camera}
                flash={isFlashActive ? 'on' : 'off'}
                enableTorch={isFlashActive}
            />

            <View style={styles.topBar}>
                <TouchableOpacity style={styles.smallButton} onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    Speech.speak("Инструкция. Наверху справа кнопка настроек и кнопка управления фонариком. Нижняя панель содержит три круглые кнопки режимов: Обстановка, Текст и Деньги. Самая нижняя длинная кнопка останавливает чтение или повторяет текст.", speechOptions);
                }}>
                    <Ionicons name="help-circle-outline" size={35} color="white" />
                </TouchableOpacity>

                <TouchableOpacity style={[styles.smallButton, isFlashActive && styles.flashActiveButton]} onPress={toggleFlash}>
                    <Ionicons name={isFlashActive ? "flash" : "flash-off-outline"} size={30} color="white" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.smallButton} onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setIsSettingsVisible(true);
                    Speech.speak("Открыты настройки системы.", speechOptions);
                }}>
                    <Ionicons name="settings-outline" size={32} color="white" />
                </TouchableOpacity>
            </View>

            {description && <Text style={styles.text}>{description}</Text>}

            <View style={styles.bottomContainer}>
                <View style={styles.captureRow}>

                    {/* КНОПКА СРЕДА (ОБСТАНОВКА) С ДИНАМИЧЕСКИМ ИЗМЕНЕНИЕМ ПОВЕДЕНИЯ */}
                    <TouchableOpacity
                        style={[
                            styles.actionButton,
                            styles.sceneButton,
                            isYandexOnly && styles.disabledButton,
                            isLoadingScene && styles.loadingButton
                        ]}
                        onPress={isYandexOnly ? handleDisabledScenePress : () => sendPicture('scene')}
                        disabled={isLoadingScene || isLoadingText || isLoadingMoney}
                    >
                        <Ionicons name="image-outline" size={28} color="white" />
                        <Text style={styles.actionButtonText}>{isLoadingScene ? "Ждите" : "Среда"}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.actionButton, styles.textButton, isLoadingText && styles.loadingButton]}
                        onPress={() => sendPicture('text')}
                        disabled={isLoadingScene || isLoadingText || isLoadingMoney}
                    >
                        <Ionicons name="document-text-outline" size={28} color="white" />
                        <Text style={styles.actionButtonText}>{isLoadingText ? "Ждите" : "Текст"}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.actionButton, styles.moneyButton, isLoadingMoney && styles.loadingButton]}
                        onPress={() => sendPicture('money')}
                        disabled={isLoadingScene || isLoadingText || isLoadingMoney}
                    >
                        <Ionicons name="cash-outline" size={28} color="white" />
                        <Text style={styles.actionButtonText}>{isLoadingMoney ? "Ждите" : "Деньги"}</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity
                    style={[styles.repeatButtonLong, isSpeaking ? styles.stopButtonActive : (!description && styles.disabledButton)]}
                    disabled={!description && !isSpeaking}
                    onPress={handleRepeatOrStop}
                >
                    <Ionicons name={isSpeaking ? "stop-circle-outline" : "volume-medium-outline"} size={30} color="white" />
                    <Text style={styles.repeatButtonText}>{isSpeaking ? "Остановить чтение" : "Повторить озвучку"}</Text>
                </TouchableOpacity>
            </View>

            {/* НАСТРОЙКИ */}
            <Modal animationType="slide" transparent={true} visible={isSettingsVisible} onRequestClose={() => setIsSettingsVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <ScrollView style={{ width: '100%' }} contentContainerStyle={{ alignItems: 'center' }} showsVerticalScrollIndicator={false}>
                            <Text style={styles.modalTitle}>Настройки системы «Глаза»</Text>

                            <Text style={styles.modalSectionTitle}>Инфраструктура:</Text>
                            <TouchableOpacity style={[styles.settingsOptionButton, backendSelection === 'yandex_sber_split' && styles.settingsOptionActive]} onPress={() => toggleBackend('yandex_sber_split', 'Распределенная сеть Сплит')}>
                                <Ionicons name="git-network-outline" size={20} color="white" />
                                <Text style={styles.settingsOptionText}>Яндекс + Сбер (Сплит)</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={[styles.settingsOptionButton, backendSelection === 'yandex_only' && styles.settingsOptionActive]} onPress={() => toggleBackend('yandex_only', 'Резервный контур только Яндекс')}>
                                <Ionicons name="cloud-outline" size={20} color="white" />
                                <Text style={styles.settingsOptionText}>Только Яндекс.Облако</Text>
                            </TouchableOpacity>

                            <Text style={styles.modalSectionTitle}>Скорость речи: {speechRate}x</Text>
                            <View style={styles.sliderContainer}>
                                <Slider style={styles.slider} minimumValue={0.5} maximumValue={2.0} value={speechRate} minimumTrackTintColor="#34c759" thumbTintColor="white" onValueChange={handleRateChange} onSlidingComplete={confirmRateChange} />
                            </View>

                            {availableVoices.length > 0 && (
                                <>
                                    <Text style={styles.modalSectionTitle}>Голос озвучки:</Text>
                                    {availableVoices.map((voice, idx) => {
                                        const fName = `Голос номер ${idx + 1}`;
                                        const isActive = selectedVoice === voice.identifier;

                                        return (
                                            <TouchableOpacity
                                                key={voice.identifier}
                                                style={[styles.settingsOptionButton, styles.voiceButton, isActive && styles.settingsOptionActive]}
                                                onPress={() => changeVoice(voice.identifier, fName)}
                                            >
                                                <Ionicons name="person-outline" size={18} color="white" />
                                                <Text style={styles.settingsOptionText}>{fName}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </>
                            )}

                            <TouchableOpacity style={styles.closeSettingsButton} onPress={closeSettings}>
                                <Text style={styles.closeSettingsButtonText}>Сохранить</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'black' },
    camera: { ...StyleSheet.absoluteFillObject },
    topBar: { position: 'absolute', top: 50, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    smallButton: { padding: 12, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 50 },
    flashActiveButton: { backgroundColor: '#34c759' },
    text: { color: 'white', fontSize: 17, textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.85)', padding: 15, borderRadius: 15, position: 'absolute', top: 130, alignSelf: 'center', width: '90%' },
    errorText: { color: 'white', fontSize: 16, textAlign: 'center', marginTop: '50%' },

    // ИЗМЕНЕНО: Сместили нижний блок кнопок на 60px вверх (bottom стал 90 вместо 30)
    bottomContainer: { position: 'absolute', bottom: 90, left: 15, right: 15, gap: 12 },

    captureRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
    actionButton: { flex: 1, paddingVertical: 15, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 4 },
    sceneButton: { backgroundColor: '#e67e22' },
    textButton: { backgroundColor: '#0275d8' },
    moneyButton: { backgroundColor: '#27ae60' },
    loadingButton: { backgroundColor: 'gray' },
    actionButtonText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
    repeatButtonLong: { width: '100%', paddingVertical: 16, backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 20, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10 },
    stopButtonActive: { backgroundColor: '#d9534f' },
    repeatButtonText: { color: 'white', fontSize: 17, fontWeight: 'bold' },
    disabledButton: { opacity: 0.3, backgroundColor: '#555' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.85)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { width: '92%', maxHeight: '85%', backgroundColor: '#1c1c1e', borderRadius: 25, padding: 20, alignItems: 'center' },
    modalTitle: { color: 'white', fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
    modalSectionTitle: { color: '#aeaeb2', fontSize: 13, fontWeight: '600', alignSelf: 'flex-start', marginTop: 12, marginBottom: 6, textTransform: 'uppercase' },
    settingsOptionButton: { width: '100%', flexDirection: 'row', alignItems: 'center', backgroundColor: '#2c2c2e', padding: 14, borderRadius: 12, marginBottom: 6, gap: 10 },
    voiceButton: { backgroundColor: '#242426' },
    settingsOptionActive: { backgroundColor: '#34c759' },
    settingsOptionText: { color: 'white', fontSize: 15, fontWeight: '600' },
    sliderContainer: { width: '100%', backgroundColor: '#2c2c2e', padding: 10, borderRadius: 12, marginBottom: 10 },
    slider: { width: '100%', height: 30 },
    closeSettingsButton: { width: '100%', backgroundColor: '#0275d8', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 15 },
    closeSettingsButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' }
});