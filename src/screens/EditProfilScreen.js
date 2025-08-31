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
    const { user } = useAuth();
    const navigation = useNavigation();

    const [email, setEmail] = useState('');
    const [photo, setPhoto] = useState(''); // champ "photo" côté DB
    const [localImageUri, setLocalImageUri] = useState(null);
    const [loading, setLoading] = useState(true);

    // pour changer le mot de passe sans bcrypt
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    useEffect(() => {
        if (user) fetchUserProfile();
    }, [user]);

    async function fetchUserProfile() {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('users')
                .select('email, photo')
                .eq('id', user.id)
                .single();

            if (error) {
                console.error(error);
                Alert.alert('Erreur', 'Impossible de charger les données');
            } else {
                setEmail(data?.email || '');
                setPhoto(data?.photo || 'https://via.placeholder.com/150');
            }
        } catch (e) {
            console.error(e);
            Alert.alert('Erreur', "Une erreur est survenue lors du chargement.");
        } finally {
            setLoading(false);
        }
    }

    async function handleSave() {
        setLoading(true);
        try {
            // 0) S'assurer qu'on a bien un user Auth actif
            const { data: authUserData, error: authUserErr } = await supabase.auth.getUser();
            if (authUserErr || !authUserData?.user) {
                Alert.alert('Session expirée', 'Merci de vous reconnecter.');
                // Reset navigation vers le Login (dans AuthNavigator)
                navigation.reset({ index: 0, routes: [{ name: 'AuthNavigator' }] });
                return;
            }

            const authEmail = authUserData.user.email;
            if (!authEmail) {
                throw new Error("Ce compte n'utilise pas l'authentification par email/password.");
            }

            // 1) Si demande de changement de mot de passe → réauth stricte AVANT toute modif
            const wantsPwChange = !!(oldPassword || newPassword || confirmPassword);
            if (wantsPwChange) {
                if (!oldPassword) throw new Error("Veuillez saisir l'ancien mot de passe.");
                if (!newPassword) throw new Error('Veuillez saisir le nouveau mot de passe.');
                if (newPassword.length < 8) throw new Error('Le nouveau mot de passe doit contenir au moins 8 caractères.');
                if (newPassword !== confirmPassword) throw new Error('La confirmation ne correspond pas au nouveau mot de passe.');

                const { data: reauthData, error: reauthErr } = await supabase.auth.signInWithPassword({
                    email: authEmail,
                    password: oldPassword,
                });
                if (reauthErr || !reauthData?.session) {
                    throw new Error('Ancien mot de passe incorrect.');
                }

                const { error: pwErr } = await supabase.auth.updateUser({ password: newPassword });
                if (pwErr) throw pwErr;
            }

            // 2) Préparer l'image si besoin
            let nextPhoto = photo;
            if (localImageUri) {
                const base64 = await FileSystem.readAsStringAsync(localImageUri, {
                    encoding: FileSystem.EncodingType.Base64,
                });
                nextPhoto = `data:image/jpeg;base64,${base64}`;
            }

            // 3) Mettre à jour la table users (photo + email si stocké ici)
            const { error: updateError } = await supabase
                .from('users')
                .update({ photo: nextPhoto, email: email.trim() })
                .eq('id', user.id);
            if (updateError) throw updateError;

            // 4) Mettre à jour l'email côté Auth si différent
            if (email && authEmail && email.trim() !== authEmail) {
                const { error: emailErr } = await supabase.auth.updateUser({ email: email.trim() });
                if (emailErr) throw emailErr; // peut nécessiter confirmation par email
            }

            // 5) Succès → redirection vers LoginScreen
            Alert.alert('Succès', 'Profil mis à jour !', [
                { text: 'OK', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'AuthNavigator' }] }) },
            ]);

            setLocalImageUri(null);
            setOldPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err) {
            console.error(err);
            Alert.alert('Erreur', err?.message || 'Échec de la mise à jour.');
        } finally {
            setLoading(false);
        }
    }

    async function pickImage() {
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permissionResult.granted) {
            Alert.alert('Permission requise', 'Accès à la galerie refusé.');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.7,
            allowsEditing: true,
        });

        if (!result.canceled) {
            const selectedUri = result.assets[0].uri;
            setLocalImageUri(selectedUri);
            setPhoto(selectedUri);
        }
    }

    function getDisplayImage() {
        if (localImageUri) return { uri: localImageUri };
        if (photo?.startsWith('data:image')) return { uri: photo };
        return { uri: photo };
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
                    <TextInput
                        style={styles.input}
                        value={email}
                        onChangeText={(v) => setEmail(v)}
                        keyboardType="email-address"
                        autoCapitalize="none"
                    />

                    <Text style={styles.label}>Ancien mot de passe</Text>
                    <TextInput
                        style={styles.input}
                        value={oldPassword}
                        onChangeText={setOldPassword}
                        secureTextEntry
                        placeholder="Mot de passe actuel"
                        placeholderTextColor="#777"
                    />

                    <Text style={styles.label}>Nouveau mot de passe</Text>
                    <TextInput
                        style={styles.input}
                        value={newPassword}
                        onChangeText={setNewPassword}
                        secureTextEntry
                        placeholder="Au moins 8 caractères"
                        placeholderTextColor="#777"
                    />

                    <Text style={styles.label}>Confirmer le nouveau mot de passe</Text>
                    <TextInput
                        style={styles.input}
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        secureTextEntry
                        placeholder="Répétez le mot de passe"
                        placeholderTextColor="#777"
                    />

                    <TouchableOpacity style={[styles.saveButton, loading && { opacity: 0.6 }]} onPress={handleSave} disabled={loading}>
                        <Text style={styles.saveButtonText}>Enregistrer</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
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
        zIndex: 999,
    },
    navItem: { flex: 1, alignItems: 'center', paddingVertical: 5 },
    navText: { fontSize: 11, color: '#CCC', marginTop: 5 },
    activeNavText: { color: '#7078DC' },
});
