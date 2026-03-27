import React from "react"
import { View, StyleSheet } from 'react-native'
import { Camera, useCameraPermissions } from 'expo-camera'
import { useState, useRef } from 'react'

export default function MainWindow() {
    return (
        <View style={styles.container}>

        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'green',
        flex: 1,
    }
})