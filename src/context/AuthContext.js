import React, { createContext, useContext, useState, useEffect } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loginStartTime, setLoginStartTime] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  const saveSession = async (sessionData) => {
    try {
      await AsyncStorage.setItem('userSession', JSON.stringify(sessionData));
    } catch (error) {
      console.error('❌ Erreur sauvegarde session:', error);
    }
  };

  const getSavedSession = async () => {
    try {
      const savedSession = await AsyncStorage.getItem('userSession');
      return savedSession ? JSON.parse(savedSession) : null;
    } catch (error) {
      console.error('❌ Erreur récupération session:', error);
      return null;
    }
  };

  const clearSession = async () => {
    try {
      await AsyncStorage.removeItem('userSession');
      await AsyncStorage.removeItem('session'); // au cas où ancien format
      setUser(null);
    } catch (error) {
      console.error('❌ Erreur clear session:', error);
    }
  };

  const getUserName = (userData) => {
    if (!userData) return 'Utilisateur';
    if (userData.name?.trim()) return userData.name.trim();
    const firstName = userData.firstName || userData.prenom || '';
    const lastName = userData.lastName || userData.nom || '';
    const fullName = `${firstName} ${lastName}`.trim();
    if (fullName) return fullName;
    if (userData.username?.trim()) return userData.username.trim();
    if (userData.email) return userData.email.split('@')[0];
    return 'Utilisateur';
  };

  useEffect(() => {
    const initializeAuth = async () => {
      setIsInitializing(true);
      try {
        const savedSession = await getSavedSession();
        if (savedSession?.user) {
          const expired = savedSession.expiresAt && new Date() > new Date(savedSession.expiresAt);
          if (expired) {
            console.log('⛔ Session expirée');
            await clearSession();
          } else {
            setUser(savedSession.user);
            setLoginStartTime(savedSession.loginStart || null);
            console.log('✅ Session restaurée pour:', getUserName(savedSession.user));
          }
        }
      } catch (err) {
        console.error('❌ Erreur init auth:', err);
      } finally {
        setIsInitializing(false);
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          console.log('⚙️ Auth state changed:', event, session?.user?.email);
          if (session?.user) {
            const { data: collectorData } = await supabase
                .from('collectors')
                .select('*')
                .eq('email', session.user.email)
                .single();

            const userData = { ...session.user, collectorData };
            setUser(userData);

            await saveSession({
              user: userData,
              loginStart: Date.now(),
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            });

            setLoginStartTime(Date.now());
            console.log('✅ Connecté :', getUserName(userData));
          } else {
            await clearSession();
          }
          setIsInitializing(false);
        }
    );

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email, password) => {
    setIsLoading(true);
    const trimmedEmail = email.trim().toLowerCase();

    try {
      const { data: userData, error } = await supabase
          .from('users')
          .select('*')
          .eq('email', trimmedEmail)
          .eq('password', password)
          .single();

      if (error || !userData) throw new Error('Email ou mot de passe incorrect');

      const completeUser = {
        id: userData.id,
        email: userData.email,
        role: userData.role,
        name: userData.name,
        firstName: userData.firstName || userData.prenom,
        lastName: userData.lastName || userData.nom,
        username: userData.username,
        phone: userData.phone || userData.telephone,
        bureau_id: userData.bureau_id
      };

      const now = Date.now();
      await saveSession({
        user: completeUser,
        loginStart: now,
        expiresAt: new Date(now + 24 * 60 * 60 * 1000).toISOString()
      });

      setUser(completeUser);
      setLoginStartTime(now);
      console.log('✅ Connexion réussie :', getUserName(completeUser));

      return { auth: { user: completeUser }, profile: completeUser };
    } catch (err) {
      console.error('❌ Login error:', err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      const now = Date.now();
      const currentUserName = getUserName(user);

      if (user && loginStartTime) {
        const durationMs = now - loginStartTime;
        const totalSeconds = Math.floor(durationMs / 1000);
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        const hoursUsed = h + m / 60 + s / 3600;

        const { data: collector, error } = await supabase
            .from('collectors')
            .select('hours_served')
            .eq('user_id', user.id)
            .single();

        const currentHours = collector?.hours_served != null ? collector.hours_served : 0;
        const updated = currentHours + hoursUsed;

        const { error: updateError } = await supabase
            .from('collectors')
            .update({ hours_served: updated })
            .eq('user_id', user.id);

        if (updateError) {
          console.error('❌ Erreur update hours_served:', updateError);
        } else {
          console.log(`⏱️ Session : ${h}h ${m}m ${s}s → Total: ${updated.toFixed(2)}h`);
        }
      }

      setLoginStartTime(null);
      await clearSession();
      const { error } = await supabase.auth.signOut();
      if (error) console.error('❌ Supabase signOut:', error);

      console.log('👋 Déconnexion réussie pour :', currentUserName);
    } catch (err) {
      console.error('❌ Logout error:', err);
      await clearSession();
    } finally {
      setIsLoading(false);
    }
  };

  const resetPassword = async (email) => {
    try {
      setIsLoading(true);
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'your-app://reset-password',
      });
      if (error) throw error;
      Alert.alert('Email envoyé', 'Vérifie ta boîte mail.');
    } catch (err) {
      console.error('❌ Reset error:', err);
      Alert.alert('Erreur', 'Échec envoi email');
    } finally {
      setIsLoading(false);
    }
  };

  const updateCollectorData = async (updates) => {
    if (!user) return;
    try {
      const { data, error } = await supabase
          .from('collectors')
          .update(updates)
          .eq('id', user.id)
          .select()
          .single();

      if (error) throw error;

      const updatedUser = {
        ...user,
        collectorData: { ...user.collectorData, ...data }
      };

      setUser(updatedUser);
      await saveSession({
        user: updatedUser,
        expiresAt: new Date(Date.now() + 86400000).toISOString()
      });

      return data;
    } catch (err) {
      console.error('❌ Update collector:', err);
      throw err;
    }
  };

  const updateUserProfile = async (updates) => {
    if (!user) return;
    try {
      const { data, error } = await supabase
          .from('users')
          .update(updates)
          .eq('id', user.id)
          .select()
          .single();

      if (error) throw error;

      const updatedUser = { ...user, ...updates };
      setUser(updatedUser);
      await saveSession({
        user: updatedUser,
        expiresAt: new Date(Date.now() + 86400000).toISOString()
      });

      return updatedUser;
    } catch (err) {
      console.error('❌ Update profile:', err);
      throw err;
    }
  };

  const userName = getUserName(user);

  return (
      <AuthContext.Provider
          value={{
            user,
            isLoading,
            isInitializing,
            login,
            logout,
            resetPassword,
            updateCollectorData,
            updateUserProfile,
            clearSession,
            getUserName,
            isAuthenticated: !!user,
            userName,
            userEmail: user?.email,
            userRole: user?.role,
            userFirstName: user?.firstName || user?.prenom,
            userLastName: user?.lastName || user?.nom,
            userFullName: user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : userName,
          }}
      >
        {children}
      </AuthContext.Provider>
  );
};
