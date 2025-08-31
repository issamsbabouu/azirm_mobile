// src/context/AuthContext.js
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';

const AuthContext = createContext(null);
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};

/* ====================== Helpers ====================== */
const getUserName = (u) => {
  if (!u) return 'Utilisateur';
  if (u.name?.trim()) return u.name.trim();
  const first = u.firstName ?? u.prenom ?? '';
  const last  = u.lastName ?? u.nom ?? '';
  const full  = `${first} ${last}`.trim();
  if (full) return full;
  if (u.username?.trim()) return u.username.trim();
  if (u.email) return u.email.split('@')[0];
  return 'Utilisateur';
};

const extractPosteLabel = (obj) =>
    obj?.poste?.nom ?? obj?.poste?.name ?? obj?.poste_nom ?? obj?.poste_name ?? null;

const fetchPosteLabelById = async (posteId) => {
  if (!posteId) return null;
  const { data, error } = await supabase
      .from('poste') // adapte si la table s'appelle "postes"
      .select('id, nom, name')
      .eq('id', posteId)
      .maybeSingle();
  if (error) {
    console.error('❌ fetchPosteLabelById:', error);
    return null;
  }
  return data?.nom ?? data?.name ?? null;
};

const ensurePosteLabel = async (rawUser) => {
  if (!rawUser) return rawUser;
  const u = { ...rawUser };
  u.poste_id    = u.poste_id ?? u.posteId ?? null;
  u.poste_label = u.poste_label ?? extractPosteLabel(u) ?? null;
  if (!u.poste_label && u.poste_id) {
    u.poste_label = await fetchPosteLabelById(u.poste_id);
  }
  return u;
};

// --- Helpers temps de connexion ---
const msToHours = (ms) => Math.max(0, ms) / 3600000;
const round2 = (n) => Math.round(n * 100) / 100;

const formatHMS = (totalMs) => {
  const t = Math.max(0, Math.floor(totalMs / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

/**
 * Incrémente le cumul d'heures côté DB (RPC atomique).
 * Requiert la fonction SQL: public.increment_heures_depensees(p_user_id uuid, p_inc_hours numeric)
 * et des policies RLS compatibles.
 */
const addElapsedHoursToDb = async (userId, incHours) => {
  if (!userId || !Number.isFinite(incHours) || incHours <= 0) return null;
  const { error } = await supabase.rpc('increment_heures_depensees', {
    p_user_id: userId,
    p_inc_hours: round2(incHours),
  });
  if (error) {
    console.error('❌ RPC increment_heures_depensees:', error);
    return null;
  }
  return true;
};

// Finalise une session: calcule le temps écoulé depuis loginStart, crédite en DB
const finalizeSessionAndPersist = async (savedOrState) => {
  try {
    const uid = savedOrState?.user?.id;
    const start = Number(savedOrState?.loginStart ?? 0);
    if (!uid || !start) return;

    const now = Date.now();
    const hardStop = savedOrState?.expiresAt ? new Date(savedOrState.expiresAt).getTime() : now;
    const until = Math.min(now, hardStop);

    const elapsedMs = until - start;
    const incHours = round2(msToHours(elapsedMs));
    if (incHours > 0) {
      await addElapsedHoursToDb(uid, incHours);
    }
  } catch (e) {
    console.error('❌ finalizeSessionAndPersist:', e);
  }
};

/* ====================== Provider ====================== */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);               // objet ENTIER users (+ poste joint)
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginStartTime, setLoginStartTime] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  // Ticker live
  const [nowTs, setNowTs] = useState(Date.now());
  const tickRef = useRef(null);

  // Flush périodique
  const FLUSH_MS = 60_000; // 60s => quasi temps réel DB
  const flushRef = useRef(null);
  const isFlushing = useRef(false);

  // Session storage
  const saveSession = async (sessionData) => {
    try { await AsyncStorage.setItem('userSession', JSON.stringify(sessionData)); }
    catch (e) { console.error('❌ saveSession:', e); }
  };
  const getSavedSession = async () => {
    try {
      const s = await AsyncStorage.getItem('userSession');
      return s ? JSON.parse(s) : null;
    } catch (e) {
      console.error('❌ getSavedSession:', e);
      return null;
    }
  };
  const clearSession = async () => {
    try {
      await AsyncStorage.removeItem('userSession');
      await AsyncStorage.removeItem('session'); // anciens formats
      setUser(null);
      setLoginStartTime(null);
      setIsAuthenticated(false);
    } catch (e) {
      console.error('❌ clearSession:', e);
    }
  };

  // Restauration au démarrage
  useEffect(() => {
    (async () => {
      setIsInitializing(true);
      try {
        const saved = await getSavedSession();
        if (saved?.user) {
          const now = new Date();
          const expired = saved.expiresAt && now > new Date(saved.expiresAt);

          if (expired) {
            console.log('⛔ Session expirée');
            await finalizeSessionAndPersist(saved); // crédite jusqu’à l’expiration
            await clearSession();
          } else {
            const restored = await ensurePosteLabel(saved.user);
            setUser(restored);
            setLoginStartTime(saved.loginStart || null);
            setIsAuthenticated(true);
          }
        }
      } catch (e) {
        console.error('❌ init auth:', e);
      } finally {
        setIsInitializing(false);
      }
    })();
  }, []);

  // Connexion — récupère TOUTES les colonnes users (*) + jointure poste
  const login = async (email, password) => {
    setIsLoading(true);
    const trimmedEmail = email.trim().toLowerCase();
    try {
      const { data, error } = await supabase
          .from('users')
          .select(`
          *,
          poste:poste_id ( id, nom, name )
        `)
          .ilike('email', trimmedEmail)
          .eq('password', password)
          .maybeSingle();

      if (error || !data) throw new Error('Email ou mot de passe incorrect');

      const completeUser = await ensurePosteLabel(data);

      const now = Date.now();
      await saveSession({
        user: completeUser,
        loginStart: now,
        expiresAt: new Date(now + 86400000).toISOString(), // 24h
      });

      setUser(completeUser);
      setIsAuthenticated(true);
      setLoginStartTime(now);

      return { auth: { user: completeUser }, profile: completeUser };
    } catch (err) {
      console.error('❌ Login error:', err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Déconnexion — crédite puis nettoie
  const logout = async () => {
    setIsLoading(true);
    try {
      const name = getUserName(user);

      // stop intervals pour éviter double flush
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
      if (flushRef.current) { clearInterval(flushRef.current); flushRef.current = null; }

      if (user && loginStartTime) {
        await finalizeSessionAndPersist({ user, loginStart: loginStartTime });
      }
      await clearSession();

      try {
        const { error } = await supabase.auth.signOut();
        if (error) console.error('❌ Supabase signOut:', error);
      } catch {}
      console.log('👋 Déconnexion réussie pour :', name);
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

  // Mettre à jour et recharger TOUTES les colonnes + poste
  const updateUserProfile = async (updates) => {
    if (!user) return;
    try {
      const { data, error } = await supabase
          .from('users')
          .update(updates)
          .eq('id', user.id)
          .select(`
          *,
          poste:poste_id ( id, nom, name )
        `)
          .maybeSingle();

      if (error) throw error;

      const updatedUser = await ensurePosteLabel(data);
      setUser(updatedUser);
      await saveSession({
        user: updatedUser,
        loginStart: loginStartTime,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
      return updatedUser;
    } catch (err) {
      console.error('❌ Update profile:', err);
      throw err;
    }
  };

  // --------- LIVE TICKER (affichage) ----------
  useEffect(() => {
    if (!isAuthenticated || !loginStartTime) return;
    // tick chaque seconde pour l'affichage live
    tickRef.current && clearInterval(tickRef.current);
    tickRef.current = setInterval(() => setNowTs(Date.now()), 1000);
    return () => {
      tickRef.current && clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [isAuthenticated, loginStartTime]);

  // --------- FLUSH PÉRIODIQUE (persistance quasi temps réel) ----------
  const doPeriodicFlush = async () => {
    if (!user || !loginStartTime || isFlushing.current) return;
    isFlushing.current = true;
    try {
      const now = Date.now();
      const incHours = round2(msToHours(now - loginStartTime));
      if (incHours > 0) {
        const ok = await addElapsedHoursToDb(user.id, incHours);
        if (ok) {
          // Mets à jour l'utilisateur localement pour refléter le cumul
          setUser((prev) => prev ? { ...prev, heures_depensees: round2((prev.heures_depensees ?? 0) + incHours) } : prev);
          // Redémarre le segment
          setLoginStartTime(now);
          await saveSession({
            user: { ...(user || {}), heures_depensees: round2((user?.heures_depensees ?? 0) + incHours) },
            loginStart: now,
            expiresAt: new Date(now + 86400000).toISOString(),
          });
        }
      }
    } catch (e) {
      console.error('❌ doPeriodicFlush:', e);
    } finally {
      isFlushing.current = false;
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !loginStartTime) return;
    flushRef.current && clearInterval(flushRef.current);
    flushRef.current = setInterval(doPeriodicFlush, FLUSH_MS);
    return () => {
      flushRef.current && clearInterval(flushRef.current);
      flushRef.current = null;
    };
  }, [isAuthenticated, loginStartTime, user?.id]);

  // Auto-flush à la mise en arrière-plan
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        doPeriodicFlush();
      }
    });
    return () => sub.remove();
  }, [user, loginStartTime]);

  // Flush manuel (si besoin à d'autres moments)
  const flushElapsedNow = async () => {
    await doPeriodicFlush();
  };

  // --------- VALEURS LIVE EXPOSEES ----------
  const baseHours = Number(user?.heures_depensees ?? 0);
  const sessionMs = loginStartTime ? Math.max(0, nowTs - loginStartTime) : 0;
  const liveMs = baseHours * 3600000 + sessionMs;
  const liveHours = round2(liveMs / 3600000);
  const liveTimeFormatted = formatHMS(liveMs);

  const userName = getUserName(user);

  return (
      <AuthContext.Provider
          value={{
            // state
            user,
            isAuthenticated,
            isLoading,
            isInitializing,
            loginStartTime,

            // actions
            login,
            logout,
            resetPassword,
            updateUserProfile,
            clearSession,
            flushElapsedNow,

            // live (temps réel)
            liveMs,
            liveHours,
            liveTimeFormatted,

            // setters si besoin
            setUser,
            setIsAuthenticated,

            // helpers
            getUserName,
            userName,

            // accès rapides (optionnels)
            userEmail: user?.email,
            userRole: user?.role,
            userPosteId: user?.poste_id ?? user?.posteId,
            userPosteLabel: user?.poste_label || user?.poste?.nom || user?.poste?.name,
          }}
      >
        {children}
      </AuthContext.Provider>
  );
};
