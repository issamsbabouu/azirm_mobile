import React, { useState, useEffect } from 'react';
import {
  View, Text, Image, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { supabase } from '../supabase';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext'; // 👈 import theme

const primaryColor = '#7078DC';
const secondaryColor = '#8F71C1';

const LoginScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const { isAuthenticated, user, setIsAuthenticated, setUser, liveHours, liveTimeFormatted } = useAuth?.() || {
    isAuthenticated: false,
    user: null,
    setIsAuthenticated: () => {},
    setUser: () => {},
     liveHours: 0,
      liveTimeFormatted: '00:00:00',
};

  const navigation = useNavigation();
  const [checking, setChecking] = useState(false);

  // 👇 Thème
  const { isDark, toggleTheme } = useTheme();

  useEffect(() => {}, [isAuthenticated, user]);

  useEffect(() => {
    const loadSavedCredentials = async () => {
      try {
        const savedEmail = await AsyncStorage.getItem('email');
        const savedPassword = await AsyncStorage.getItem('password');
        if (savedEmail && savedPassword) {
          setEmail(savedEmail);
          setPassword(savedPassword);
          setRememberMe(true);
        }
      } catch (error) {
        console.log('Erreur chargement credentials:', error);
      }
    };
    loadSavedCredentials();
  }, []);

  const validateEmail = (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);

  const handleLogin = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = (password ?? '').trim();

    if (!trimmedEmail || !validateEmail(trimmedEmail) || !trimmedPassword) {
      Alert.alert('Erreur', 'Veuillez remplir correctement les champs');
      return;
    }

    try {
      setChecking(true);
      const { data: userRow, error } = await supabase
          .from('users')
          .select('*')
          .ilike('email', trimmedEmail)
          .eq('password', trimmedPassword)
          .maybeSingle();

      if (error) {
        Alert.alert('Connexion échouée', error.message || 'Erreur Supabase');
        return;
      }
      if (!userRow) {
        Alert.alert('Connexion échouée', 'Email ou mot de passe incorrect');
        return;
      }

      if (rememberMe) {
        await AsyncStorage.setItem('email', trimmedEmail);
        await AsyncStorage.setItem('password', trimmedPassword);
      } else {
        await AsyncStorage.removeItem('email');
        await AsyncStorage.removeItem('password');
      }

      setUser?.(userRow);
      setIsAuthenticated?.(true);
    } catch (e) {
      Alert.alert('Connexion échouée', 'Une erreur est survenue, veuillez réessayer.');
    } finally {
      setChecking(false);
    }
  };

  return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#000' : '#fff' }]}>
        {/* Bouton switch thème */}
        <View style={styles.themeToggle}>
          <TouchableOpacity onPress={toggleTheme} style={styles.themeButton}>
            <FontAwesome5
                name={isDark ? 'sun' : 'moon'}
                size={18}
                color={isDark ? '#FFD700' : '#333'}
            />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.logoContainer}>
              <Image source={require('../../assets/logo_whte.png')} style={styles.logo} resizeMode="contain" />
              <Text style={[styles.welcomeText, { color: isDark ? '#FFF' : '#000' }]}>Bienvenue !</Text>
              <Text style={[styles.subtitleText, { color: isDark ? '#A1A1AA' : '#555' }]}>
                Connectez-vous pour continuer
              </Text>
            </View>

            <View style={[styles.loginCard, { backgroundColor: isDark ? '#1C1C1E' : '#f7f7f7' }]}>
              <View style={[styles.inputContainer, !validateEmail(email) && email.length > 0 && styles.inputError]}>
                <FontAwesome5 name="envelope" size={16} color={!validateEmail(email) && email.length > 0 ? '#EF4444' : '#A0A0A0'} style={styles.icon} />
                <TextInput
                    style={[styles.input, { color: isDark ? '#FFF' : '#000' }]}
                    placeholder="Adresse email"
                    placeholderTextColor={isDark ? '#888' : '#555'}
                    value={email}
                    onChangeText={(text) => setEmail(text.toLowerCase())}
                    keyboardType="email-address"
                    autoCapitalize="none"
                />
              </View>
              {!validateEmail(email) && email.length > 0 && (
                  <Text style={styles.errorText}>Format d'email invalide</Text>
              )}

              <View style={styles.inputContainer}>
                <FontAwesome5 name="lock" size={16} color="#A0A0A0" style={styles.icon} />
                <TextInput
                    style={[styles.input, { color: isDark ? '#FFF' : '#000' }]}
                    placeholder="Mot de passe"
                    placeholderTextColor={isDark ? '#888' : '#555'}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!passwordVisible}
                />
                <TouchableOpacity onPress={() => setPasswordVisible(!passwordVisible)}>
                  <FontAwesome5 name={passwordVisible ? 'eye-slash' : 'eye'} size={16} color="#A0A0A0" />
                </TouchableOpacity>
              </View>

              <View style={styles.options}>
                <TouchableOpacity style={styles.rememberMe} onPress={() => setRememberMe(!rememberMe)}>
                  <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                    {rememberMe && <FontAwesome5 name="check" size={10} color="white" />}
                  </View>
                  <Text style={[styles.rememberMeText, { color: isDark ? '#CCC' : '#555' }]}>
                    Se souvenir de moi
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                  style={[styles.loginButton, (!email.trim() || !password || !validateEmail(email.trim())) && styles.buttonDisabled]}
                  onPress={handleLogin}
                  disabled={!email.trim() || !password || !validateEmail(email.trim())}
              >
                {checking ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator color="white" size="small" />
                      <Text style={[styles.buttonText, { marginLeft: 10 }]}>Connexion...</Text>
                    </View>
                ) : (
                    <>
                      <FontAwesome5 name="sign-in-alt" size={16} color="white" style={{ marginRight: 8 }} />
                      <Text style={styles.buttonText}>Se connecter</Text>
                    </>

                )}
              </TouchableOpacity>
              <View style={{ alignItems: 'center', marginTop: 8 }}>
                <Text style={{ fontSize: 12, color: isDark ? '#A1A1AA' : '#666' }}>
                  Temps connecté (live) : <Text style={{ fontWeight: '700' }}>{liveTimeFormatted}</Text> ({liveHours} h)
                </Text>
              </View>

            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  themeToggle: { position: 'absolute', top: 10, right: 10, zIndex: 10 },
  themeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 20, paddingBottom: 40 },
  logoContainer: { alignItems: 'center', marginBottom: 40 },
  logo: { width: 200, height: 100, marginBottom: 16 },
  welcomeText: { fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  subtitleText: { fontSize: 16, textAlign: 'center' },
  loginCard: {
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 5, marginBottom: 20,
  },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#4B4B4D', borderRadius: 12,
    paddingHorizontal: 16, marginBottom: 4, minHeight: 50,
  },
  inputError: { borderColor: '#EF4444', backgroundColor: '#3A1A1A' },
  icon: { marginRight: 12 },
  input: { flex: 1, height: 50, fontSize: 16 },
  errorText: { color: '#EF4444', fontSize: 12, marginBottom: 12, marginLeft: 4 },
  options: { flexDirection: 'row', justifyContent: 'flex-start', marginBottom: 24, marginTop: 12 },
  rememberMe: { flexDirection: 'row', alignItems: 'center' },
  checkbox: {
    width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: '#D1D5DB',
    justifyContent: 'center', alignItems: 'center', marginRight: 8,
  },
  checkboxChecked: { backgroundColor: secondaryColor, borderColor: secondaryColor },
  rememberMeText: { fontSize: 14 },
  loginButton: {
    backgroundColor: primaryColor, borderRadius: 12, height: 50,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    marginBottom: 16, shadowColor: primaryColor, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4, elevation: 3,
  },
  buttonDisabled: { opacity: 0.6, shadowOpacity: 0, elevation: 0 },
  buttonText: { color: 'white', fontWeight: '600', fontSize: 16 },
  loadingContainer: { flexDirection: 'row', alignItems: 'center' },
});

export default LoginScreen;
