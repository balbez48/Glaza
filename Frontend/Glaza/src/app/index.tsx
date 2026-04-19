// app/index.tsx
import React, { useRef, useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { describeImage } from '../services/gigachat';

export default function Index() {
    const cameraRef = useRef<CameraView | null>(null);
    const [permission, requestPermission] = useCameraPermissions();
    const [description, setDescription] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const insets = useSafeAreaInsets();

    // Запрос разрешений при старте
    if (!permission) {
        return (
            <View style={styles.container}>
                <Text style={styles.loadingText}>Запрос разрешения...</Text>
            </View>
        );
    }

    if (!permission.granted) {
        return (
            <View style={styles.container}>
                <Text style={styles.infoText}>Нет доступа к камере</Text>
                <TouchableOpacity style={styles.buttonPicture} onPress={requestPermission}>
                    <Text style={styles.buttonText}>Запросить разрешение</Text>
                </TouchableOpacity>
            </View>
        );
    }

    async function sendPicture() {
        if (!cameraRef.current) {
            Alert.alert('Ошибка', 'Камера не готова');
            return;
        }

        setIsLoading(true);
        setDescription(null);

        try {
            const photo = await cameraRef.current.takePictureAsync({
                quality: 0.55,
                base64: true,
                exif: false,
            });

            if (!photo?.base64) {
                Alert.alert('Ошибка', 'Не удалось получить изображение');
                setIsLoading(false);
                return;
            }

            setDescription('Обработка...');
            const answer = await describeImage(photo.base64);
            setDescription(answer);
            
        } catch (error) {
            console.error('Ошибка при отправке:', error);
            Alert.alert('Ошибка', error instanceof Error ? error.message : 'Не удалось получить описание');
            setDescription(null);
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <View style={styles.container}>
            <CameraView ref={cameraRef} style={styles.camera} />
            
            <View style={[styles.buttonCont, { bottom: 110 + insets.bottom }]}>
                {isLoading && <Text style={styles.loadingText}>Обработка...</Text>}
                
                <Text style={styles.descriptionText}>
                    {description || 'Сделайте снимок для описания'}
                </Text>
                
                <TouchableOpacity 
                    style={[styles.buttonPicture, isLoading && styles.buttonDisabled]} 
                    onPress={sendPicture}
                    disabled={isLoading}
                >
                    <Text style={styles.buttonText}>📸 Сделать снимок</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    camera: {
        flex: 1,
        width: '100%',
    },
    buttonCont: {
        position: 'absolute',
        bottom: 130,
        left: 20,
        right: 20,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
        zIndex: 20,
    },
    buttonPicture: {
        backgroundColor: '#208AEF',
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 12,
        marginTop: 10,
        width: '100%',
        alignItems: 'center',
    },
    buttonDisabled: {
        backgroundColor: '#666',
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    descriptionText: {
        color: '#fff',
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 10,
        lineHeight: 20,
    },
    loadingText: {
        color: '#fff',
        fontSize: 14,
        textAlign: 'center',
    },
    infoText: {
        color: '#fff',
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 20,
    },
});
