import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, StyleSheet, Alert, ActivityIndicator, ScrollView, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import * as FileSystem from 'expo-file-system';
import { useNavigation } from '@react-navigation/native';
import 'react-native-url-polyfill/auto';

const { width } = Dimensions.get('window');

export default function EditProfileScreen() {
    const { user, logout } = useAuth();
    const navigation = useNavigation();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [profileImage, setProfileImage] = useState('');
    const [localImageUri, setLocalImageUri] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) fetchUserProfile();
    }, [user]);

    async function fetchUserProfile() {
        setLoading(true);
        const { data, error } = await supabase.from('users').select('email, profile_image').eq('id', user.id).single();
        if (error) {
            console.error(error);
            Alert.alert("Erreur", "Impossible de charger les données");
        } else {
            setEmail(data.email || '');
            setProfileImage(data.profile_image || 'https://via.placeholder.com/150');
        }
        setLoading(false);
    }

    async function handleSave() {
        setLoading(true);
        try {
            let base64Image = profileImage;
            if (localImageUri) {
                const base64 = await FileSystem.readAsStringAsync(localImageUri, { encoding: FileSystem.EncodingType.Base64 });
                base64Image = `data:image/jpeg;base64,${base64}`;
            }

            const { error: updateError } = await supabase
                .from('users')
                .update({ profile_image: base64Image })
                .eq('id', user.id);
            if (updateError) throw updateError;

            const { data: sessionData } = await supabase.auth.getSession();
            if (!sessionData?.session) {
                Alert.alert("Session expirée", "Merci de vous reconnecter.");
                navigation.replace('Login');
                return;
            }

            if (email !== user.email) {
                const { error: emailError } = await supabase.auth.updateUser({ email });
                if (emailError) throw emailError;
            }

            if (password) {
                setLoading(false);
                Alert.alert("Mise à jour", "Profil à jour, mise à jour du mot de passe...");
                setLoading(true);
                const { error: passwordError } = await supabase.auth.updateUser({ password });
                if (passwordError) throw passwordError;
            }

            Alert.alert("Succès", "Profil mis à jour !", [
                { text: "OK", onPress: () => navigation.replace('Login') }
            ]);

            setLocalImageUri(null);
        } catch (err) {
            console.error(err);
            Alert.alert("Erreur", err.message || "Échec de la mise à jour.");
        } finally {
            setLoading(false);
        }
    }

    async function pickImage() {
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permissionResult.granted) {
            Alert.alert("Permission requise", "Accès à la galerie refusé.");
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.7,
            allowsEditing: true
        });

        if (!result.canceled) {
            const selectedUri = result.assets[0].uri;
            setLocalImageUri(selectedUri);
            setProfileImage(selectedUri);
        }
    }

    function getDisplayImage() {
        if (localImageUri) return { uri: localImageUri };
        if (profileImage?.startsWith('data:image')) return { uri: profileImage };
        return { uri: profileImage };
    }

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <ActivityIndicator size="large" color="#7078DC" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView showsVerticalScrollIndicator={false}>
                <TouchableOpacity onPress={pickImage} style={styles.avatarContainer}>
                    <Image source={getDisplayImage()} style={styles.avatar} />
                    <Ionicons name="camera" size={24} color="#7078DC" style={styles.cameraIcon} />
                </TouchableOpacity>

                <View style={styles.form}>
                    <Text style={styles.label}>Email</Text>
                    <TextInput style={styles.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
                    <Text style={styles.label}>Nouveau mot de passe</Text>
                    <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry />
                    <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                        <Text style={styles.saveButtonText}>Enregistrer</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>

            <View style={styles.bottomNav}>
                {renderNavItem('home', 'Accueil', false, () => navigation.navigate('Dashboard'))}
                {renderNavItem('wallet', 'Wallet', false, () => navigation.navigate('wallet'))}
                {renderNavItem('map', 'Missions', false, () => navigation.navigate('route'))}
                {renderNavItem('stats-chart', 'Stats', false, () => navigation.navigate('stats'))}
                {renderNavItem('book', 'Formation', false, () => navigation.navigate('training'))}
            </View>
        </SafeAreaView>
    );

    function renderNavItem(iconName, label, isActive, onPress) {
        return (
            <TouchableOpacity style={styles.navItem} onPress={onPress}>
                <Ionicons name={iconName} size={24} color={isActive ? '#7078DC' : '#9CA3AF'} />
                <Text style={[styles.navText, isActive && styles.activeNavText]}>{label}</Text>
            </TouchableOpacity>
        );
    }
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#121212' },
    avatarContainer: { marginTop: 40, alignItems: 'center' },
    avatar: { width: 130, height: 130, borderRadius: 65, borderWidth: 3, borderColor: '#333' },
    cameraIcon: { position: 'absolute', bottom: 5, right: width / 2 - 90, backgroundColor: '#1C1C1E', borderRadius: 15, padding: 5 },
    form: { marginTop: 40, paddingHorizontal: 20 },
    label: { fontWeight: 'bold', marginBottom: 5, color: '#FFF' },
    input: { borderWidth: 1, borderColor: '#444', backgroundColor: '#1C1C1E', color: '#FFF', borderRadius: 10, padding: 10, marginBottom: 15 },
    saveButton: { backgroundColor: '#7078DC', padding: 15, borderRadius: 10, alignItems: 'center' },
    saveButtonText: { color: 'white', fontWeight: 'bold' },
    bottomNav: {
        position: 'absolute',
        bottom: 40,
        left: 20,
        right: 20,
        flexDirection: 'row',
        backgroundColor: '#1C1C1E',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 30,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 10,
        zIndex: 999
    },
    navItem: { flex: 1, alignItems: 'center', paddingVertical: 5 },
    navText: { fontSize: 11, color: '#CCC', marginTop: 5 },
    activeNavText: { color: '#7078DC' }
});
