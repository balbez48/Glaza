import React from 'react';
import { View, StyleSheet, Text, Button, TouchableOpacity } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { describeImage } from '../services/gigachat'

export default function MainWindow() {
    const cameraRef = useRef<CameraView>(null);
    const [permission, requestPermission] = useCameraPermissions();
    const [description, setDescription] = useState(null);

    if (!permission) {
        return (
            <View style={styles.container}>
                <Text>Запрос разрешения...</Text>
            </View>
        );
    }

    if (!permission.granted) {
        return (
            <View style={styles.container}>
                <Text>Нет доступа к камере</Text>
                <Button title="Запросить разрешение" onPress={requestPermission} />
            </View>
        );
    }

    async function sendPicture() {
        if (cameraRef.current) {
            const photo = await cameraRef.current.takePictureAsync({
                quality: 0.8,
                base64: true,
            });

            if (photo.base64) {
                const answer = await describeImage(photo.base64);
                setDescription(answer);

            } else {
                console.error('Не получили base64');
            }
        }
    }


    return (
        <View style={styles.container}>
            <CameraView ref={cameraRef} style={styles.camera} />
            <View style={styles.buttonCont}>
                <Text>{description}</Text>
                <TouchableOpacity style={styles.button} onPress={sendPicture}>
                    <Text style={styles.textBtn}>Сделать снимок</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'blue',
        justifyContent: 'center',
        alignItems: 'center',
    },
    camera: {
        flex: 1,
        width: '100%',
    },
    buttonCont: {},
    button: {},
    textBtn: {},

});