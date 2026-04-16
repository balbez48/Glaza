import React from 'react';
import { View, StyleSheet, Text, Button, TouchableOpacity } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { describeImage, getAccessToken } from '../services/gigachat'
import { green } from 'react-native-reanimated/lib/typescript/Colors';

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

    async function requestToken() {
        if (cameraRef.current) {
            getAccessToken();
        }
    }


    return (
        <View style={styles.container}>
            <CameraView ref={cameraRef} style={styles.camera} />
            <View style={styles.buttonCont}>
                <Text>{description}</Text>
                <TouchableOpacity style={styles.button_token} onPress={requestToken}>
                    <Text style={styles.textBtn}>Запросить токен</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.button_picture} onPress={sendPicture}>
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
    button_token: {
        margin: 10,
        padding: 10,
        backgroundColor: 'green'
    },
    button_picture: {
        margin: 10,
        padding: 10,
        backgroundColor: 'red'
    },
    textBtn: {},

});