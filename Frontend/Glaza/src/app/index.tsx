import React from "react"
import { View, StyleSheet } from 'react-native'
import { Camera, useCameraPermissions } from 'expo-camera'
import { useRef } from 'react'

export default function MainWindow() {
    const cameraRef = useRef<Camera>(null);
    const [permission, requestPermission] = useCameraPermissions();
    return (
        <View style={styles.container}>
            <Camera ref={cameraRef} style={styles.camera} />
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'green',
        flex: 1,
    }
})