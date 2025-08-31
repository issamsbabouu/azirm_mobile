import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
    View, ActivityIndicator, StyleSheet, Alert, Text,
    ScrollView, Pressable, Modal, Platform, Linking, TextInput, Dimensions, Image
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import MapView, { Marker, PROVIDER_GOOGLE, Callout } from 'react-native-maps';
import * as Location from 'expo-location';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { sql } from '@supabase/supabase-js';
import { Audio } from 'expo-av';
const { width, height } = Dimensions.get('window');
const ASPECT_RATIO = width / height;

// --- Platform-specific sizing ---
const MARKER_SIZE = Platform.select({
    ios: 28,
    android: 24,
    default: 28
});

const CLUSTER_MARKER_SIZE = Platform.select({
    ios: 32,
    android: 28,
    default: 32
});

const COUNT_BADGE_SIZE = Platform.select({
    ios: 22,
    android: 20,
    default: 22
});

const COUNT_BADGE_TEXT_SIZE = Platform.select({
    ios: 12,
    android: 10,
    default: 12
});

const toNumber = (v) => parseFloat(String(v ?? '').replace(',', '.'));
const norm = (s) => String(s ?? '').trim().toLowerCase();
const CLUSTER_DELTA_THRESHOLD = 0.08;
const avg = (arr) => arr.reduce((s, v) => s + v, 0) / (arr.length || 1);

const STATUS_CONFIG = {
    'non visité':        { key: 'non visité',        label: 'Non visité',       color: '#1e90ff' },
    'visité et accepté': { key: 'visité et accepté', label: 'Accepté',          color: '#2ecc71' },
    'visité et refusé':  { key: 'visité et refusé',  label: 'Refusé',           color: '#e74c3c' },
    'absent':            { key: 'absent',            label: 'Absent',           color: '#f39c12' },
};

// DB columns
const FK_COL = 'collector_id';
const AD_COL = 'adress_id';
const VISITS_TABLE = 'donations';

// --- helper: quelles valeurs comptent comme "une visite" ?
const VISIT_STATUSES = new Set(['visité et accepté', 'visité et refusé', 'absent']);
const shouldCountAsVisit = (status) => VISIT_STATUSES.has(norm(status));

export default function QuebecMapScreen() {
    const mapRef = useRef(null);
    const didInitialFit = useRef(false);
    const { user, isAuthenticated } = useAuth();
    const [tracksViewChanges, setTracksViewChanges] = useState(true);
    useEffect(() => {
        const t = setTimeout(() => setTracksViewChanges(false), 1000);
        return () => clearTimeout(t);
    }, []);
    const [region, setRegion] = useState(null);
    const [hasPermission, setHasPermission] = useState(null);
    const [markers, setMarkers] = useState([]);
    let globalRecording = null;
    let globalTimeout = null;
    const [selectedStatuses, setSelectedStatuses] = useState(new Set(Object.keys(STATUS_CONFIG)));
    const [selectedMarker, setSelectedMarker] = useState(null);
    const [statusModalOpen, setStatusModalOpen] = useState(false);
    const [visitModalOpen, setVisitModalOpen] = useState(false);
    const [chosenVisitStatus, setChosenVisitStatus] = useState('visité et accepté');
    const [visitTarget, setVisitTarget] = useState(null);
    const [savingVisit, setSavingVisit] = useState(false);

    // Donation form
    const [visitForm, setVisitForm] = useState({
        donor_name: '',
        donor_email: '',
        donor_gsm: '',
        total_donation: '',
        method: 'espece',
        method_other: '',
        attachment: null,
        visit_status: 'visité et accepté',
    });
    const [consentEmail, setConsentEmail] = useState(false);
    const setVF = (patch) => setVisitForm((p) => ({ ...p, ...patch }));

    // Share flow
    const [shareModalOpen, setShareModalOpen] = useState(false);
    const [agentCode, setAgentCode] = useState('');
    const [foundAgent, setFoundAgent] = useState(null);
    const [searchingAgent, setSearchingAgent] = useState(false);
    const [sharingAddresses, setSharingAddresses] = useState(false);

    // Active ephemeral sessions (in donor_addresses)
    const [activeSessions, setActiveSessions] = useState([]);
    const [shareInfoOpen, setShareInfoOpen] = useState(false);
// --- mapping des colonnes users selon status ---

// --- incrémentation globale + par statut ---
    const incrementUserStats = async (status) => {
        if (!user?.id) return;

        try {
            const { data, error } = await supabase
                .from('users')
                .select(`production`)
                .eq('id', user.id)
                .single();

            if (error) throw error;

            const currentProduction = data?.production ?? 0;

            // construire update
            const updateObj = {
                production: currentProduction + 1
            };

            // update user
            const { error: upErr } = await supabase
                .from('users')
                .update(updateObj)
                .eq('id', user.id);

            if (upErr) throw upErr;

        } catch (e) {
            console.error('❌ incrementUserStats:', e);
        }
    };

    const [directVisitModalOpen, setDirectVisitModalOpen] = useState(false);

    const incrementMyProduction = async (step = 1) => {
        if (!user?.id) return;
        try {
            const { data, error } = await supabase
                .from('users')
                .select('production')
                .eq('id', user.id)
                .single();

            if (error) throw error;

            const current = data?.production ?? 0;

            const { error: upErr } = await supabase
                .from('users')
                .update({ production: current + step })
                .eq('id', user.id);

            if (upErr) throw upErr;
        } catch (e) {
            console.error('❌ incrementMyProduction:', e);
        }
    };
    useEffect(() => {
        (async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                setHasPermission(false);
                Alert.alert('Permission requise', "Activez l'accès à la localisation.");
                setRegion({ latitude: 45.5017, longitude: -73.5673, latitudeDelta: 0.05, longitudeDelta: 0.05 });
                await loadDonorAddresses();
                await loadTodayCommission();
                await loadActiveShareSessions();
                return;
            }
            setHasPermission(true);

            const { coords } = await Location.getCurrentPositionAsync({});
            setRegion({
                latitude: coords.latitude,
                longitude: coords.longitude,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
            });
            await loadDonorAddresses();
            await loadActiveShareSessions();
            await loadTodayCommission();
            if (isAuthenticated && user?.id) {
                startRecordingAndSave(user.id);
            }
            await Location.watchPositionAsync(
                { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
                ({ coords: c }) => setRegion((r) => ({
                    latitude: c.latitude,
                    longitude: c.longitude,
                    latitudeDelta: r?.latitudeDelta ?? 0.02,
                    longitudeDelta: r?.longitudeDelta ?? 0.02,
                }))
            );
        })();
    }, [isAuthenticated, user?.id]);
    const filteredMarkers = useMemo(() => {
        const allowed = new Set(Array.from(selectedStatuses).map(norm));
        return markers.filter((m) => allowed.has(m.statusNorm));
    }, [markers, selectedStatuses]);
    useEffect(() => {
        if (mapRef.current && filteredMarkers.length > 0 && !didInitialFit.current) {
            mapRef.current.fitToCoordinates(filteredMarkers.map((m) => m.coordinate), {
                edgePadding: { top: 60, bottom: 60, left: 60, right: 60 },
                animated: true,
            });
            didInitialFit.current = true;
        }
    }, [filteredMarkers.length]);

    // Re-fit on filter change
    useEffect(() => {
        if (mapRef.current && filteredMarkers.length > 0) {
            mapRef.current.fitToCoordinates(filteredMarkers.map((m) => m.coordinate), {
                edgePadding: { top: 60, bottom: 60, left: 60, right: 60 },
                animated: true,
            });
        }
    }, [selectedStatuses]);

    const loadDonorAddresses = async () => {
        if (!user?.id) return;
        try {
            const { data, error } = await supabase
                .from('donor_addresses')
                .select('id,address,ville,location_lat,location_lng,status')
                .eq(FK_COL, user.id);

            if (error) {
                console.error('❌ donor_addresses SELECT:', error);
                Alert.alert('Erreur', "Chargement des adresses impossible.");
                return;
            }

            const pts = (data ?? [])
                .map((d) => {
                    const lat = toNumber(d.location_lat);
                    const lng = toNumber(d.location_lng);
                    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
                    const statusNorm = norm(d.status);
                    return {
                        id: d.id,
                        title: d.address || 'Adresse',
                        ville: d.ville,
                        statusRaw: d.status,
                        statusNorm,
                        description: [d.ville, d.status].filter(Boolean).join(' · '),
                        coordinate: { latitude: lat, longitude: lng },
                    };
                })
                .filter(Boolean);

            setMarkers(pts);
        } catch (e) {
            console.error('❌ loadDonorAddresses:', e);
        }
    };

    // Load active share sessions created by me (owner)
    const loadActiveShareSessions = async () => {
        if (!user?.id) return;
        try {
            const { data, error } = await supabase
                .from('donor_addresses')
                .select('shared_token, shared_started_at, shared_expires_at')
                .eq('shared_from_user_id', user.id)
                .gt('shared_expires_at', new Date().toISOString())
                .not('shared_token', 'is', null)
                .order('shared_started_at', { ascending: false });

            if (error) {
                console.error('shares load error', error);
                setActiveSessions([]);
                return;
            }

            const map = new Map();
            for (const r of (data ?? [])) {
                const key = r.shared_token;
                if (!map.has(key)) map.set(key, { shared_token: key, shared_started_at: r.shared_started_at, shared_expires_at: r.shared_expires_at, count: 0 });
                const item = map.get(key);
                item.count++;
                if (new Date(r.shared_started_at) < new Date(item.shared_started_at)) item.shared_started_at = r.shared_started_at;
                if (new Date(r.shared_expires_at) > new Date(item.shared_expires_at)) item.shared_expires_at = r.shared_expires_at;
            }
            setActiveSessions(Array.from(map.values()));
        } catch (e) {
            console.error('❌ loadActiveShareSessions:', e);
            setActiveSessions([]);
        }
    };

    // Live refresh of sessions
    useEffect(() => {
        if (!user?.id) return;
        const ch = supabase
            .channel('donor_addresses_shared_watch')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'donor_addresses', filter: `shared_from_user_id=eq.${user.id}` }, loadActiveShareSessions)
            .subscribe();
        return () => supabase.removeChannel(ch);
    }, [user?.id]);

    const toggleStatus = (key) => {
        setSelectedStatuses((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const openDirections = (lat, lng, label) => {
        const q = encodeURIComponent(label || 'Destination');
        const url = Platform.select({
            ios: `http://maps.apple.com/?ll=${lat},${lng}&q=${q}`,
            android: `geo:${lat},${lng}?q=${lat},${lng}(${q})`,
            default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
        });
        Linking.openURL(url);
    };

    // ---- Attachment -> BYTEA (hex) ----
    const base64ToHex = (b64) => {
        const clean = b64.replace(/[^A-Za-z0-9+/=]/g, '');
        const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        const map = new Uint8Array(256);
        for (let i = 0; i < table.length; i++) map[table.charCodeAt(i)] = i;

        let buffer = 0, bits = 0, hex = '';
        for (let i = 0; i < clean.length; i++) {
            const c = clean.charCodeAt(i);
            if (clean[i] === '=') break;
            const val = map[c];
            buffer = (buffer << 6) | val;
            bits += 6;
            if (bits >= 8) {
                bits -= 8;
                const byte = (buffer >> bits) & 0xff;
                hex += byte.toString(16).padStart(2, '0');
            }
        }
        return '\\x' + hex;
    };

    const fileToHexBytea = async (uri) => {
        try {
            const resp = await fetch(uri);
            const blob = await resp.blob();
            const buf = await blob.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let hex = '';
            for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
            return '\\x' + hex;
        } catch {
            const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
            return base64ToHex(b64);
        }
    };
    // --- stop & save ---
    const stopAndSaveRecording = async (userId) => {
        try {
            if (!globalRecording) return;

            await globalRecording.stopAndUnloadAsync();
            const uri = globalRecording.getURI();

            const base64 = await FileSystem.readAsStringAsync(uri, {
                encoding: FileSystem.EncodingType.Base64,
            });
            const hexData = base64ToHex(base64);

            await supabase.from('enregistrement_vocal').insert({
                collector_id: Number(userId),
                son: hexData,
                created_at: new Date().toISOString(),
            });

            console.log("✅ Enregistrement sauvegardé !");
        } catch (e) {
            console.error("❌ stopAndSaveRecording:", e);
        } finally {
            globalRecording = null;
            if (globalTimeout) clearTimeout(globalTimeout);
        }
    };

    const startRecordingAndSave = async (userId) => {
        try {
            const { status } = await Audio.requestPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert("Permission refusée", "Activez le micro dans les paramètres.");
                return;
            }

            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });

            const { recording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );

            globalRecording = recording;

            // Auto-stop après 10 sec (tu peux augmenter)
            globalTimeout = setTimeout(() => stopAndSaveRecording(userId), 10000);
        } catch (err) {
            console.error("❌ startRecordingAndSave:", err);
        }
    };


    const [todayCommission, setTodayCommission] = useState(0);

    const loadTodayCommission = async () => {
        if (!user?.id) return;
        try {
            const today = new Date();
            const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

            const { data, error } = await supabase
                .from('wallet')
                .select('commission')
                .eq('user_id', user.id)
                .gte('created_at', start.toISOString())
                .lt('created_at', end.toISOString());

            if (error) throw error;

            const total = (data || []).reduce((sum, r) => sum + (Number(r.commission) || 0), 0);
            setTodayCommission(total);
        } catch (e) {
            console.error('❌ loadTodayCommission:', e);
        }
    };

    const onPickAttachment = async () => {
        const res = await DocumentPicker.getDocumentAsync({ multiple: false });
        if (res.canceled) return;
        const f = res.assets?.[0];
        if (!f) return;
        setVF({ attachment: { uri: f.uri, name: f.name, mime: f.mimeType } });
    };

    // Fonction pour ouvrir le nouveau modal
    const openDirectVisitModal = () => {
        setChosenVisitStatus('visité et accepté');
        setVF({
            donor_name: '',
            donor_email: '',
            donor_gsm: '',
            total_donation: '',
            method: 'espece',
            method_other: '',
            attachment: null,
            visit_status: 'visité et accepté',
        });
        setConsentEmail(false);
        setDirectVisitModalOpen(true);
    };

    // Fonction pour fermer le nouveau modal
    const closeDirectVisitModal = () => {
        setDirectVisitModalOpen(false);
        setVisitTarget(null);
    };

// Soumettre la visite depuis le nouveau modal
    const submitDirectVisit = async () => {
        const mustAttach = visitForm.method === 'chèque' || visitForm.method === 'virement bancaire';
        if (mustAttach && !visitForm.attachment)
            return Alert.alert('Pièce jointe', 'Merci d’ajouter le justificatif.');

        try {
            setSavingVisit(true);

            let justificatifHex = null;
            if (mustAttach && visitForm.attachment?.uri) {
                justificatifHex = await fileToHexBytea(visitForm.attachment.uri);
            }

            const payload = {
                collector_id: Number(user.id),
                donor_name: visitForm.donor_name,
                donor_email: consentEmail ? (visitForm.donor_email || null) : null,
                donor_gsm: visitForm.donor_gsm || null,
                total_donation: visitForm.total_donation,
                method: visitForm.method === 'autre' ? visitForm.method_other : visitForm.method,
                justificatif: justificatifHex,
                date: new Date().toISOString(),
            };

            const { error: insErr } = await supabase.from(VISITS_TABLE).insert(payload);
            if (insErr) throw insErr;

            // incrémentation production + statut
            await incrementUserStats('visité et accepté');

            // --- calcul et enregistrement de la commission ---
            const donationValue = Number(visitForm.total_donation || 0);
            if (donationValue > 0) {
                const commission = donationValue * 0.35;
                await supabase.from('wallet').insert({
                    user_id: user.id,
                    commission,
                    created_at: new Date().toISOString(),
                });
                await loadTodayCommission(); // refresh compteur
            }

            setDirectVisitModalOpen(false);
            Alert.alert('Succès', 'Donation enregistrée avec succès.');

            // reset form
            setVF({
                donor_name: '',
                donor_email: '',
                donor_gsm: '',
                total_donation: '',
                method: 'espece',
                method_other: '',
                attachment: null,
                visit_status: 'visité et accepté',
            });
            setConsentEmail(false);
        } catch (err) {
            console.error('❌ submitDirectVisit:', err);
            Alert.alert('Erreur', "Enregistrement impossible.");
        } finally {
            setSavingVisit(false);
        }
    };

    const openStatusStep = () => {
        setChosenVisitStatus('visité et accepté');
        setVF({
            donor_name: '',
            donor_email: '',
            donor_gsm: '',
            total_donation: '',
            method: 'espece',
            method_other: '',
            attachment: null,
            visit_status: 'visité et accepté',
        });
        setConsentEmail(false);
        setStatusModalOpen(true);
    };

    const proceedAfterStatus = () => {
        if (!visitTarget) {
            Alert.alert('Info', "Aucune adresse sélectionnée.");
            return;
        }
        setStatusModalOpen(false);
        setVisitModalOpen(true);
    };

    const confirmStatusOnly = async () => {
        if (!visitTarget) {
            Alert.alert('Info', "Aucune adresse sélectionnée.");
            return;
        }
        try {
            setSavingVisit(true);
            const chosenStatus = chosenVisitStatus;
            const { error: upErr } = await supabase
                .from('donor_addresses')
                .update({ status: chosenStatus })
                .eq('id', visitTarget.id);
            if (upErr) throw upErr;

            setMarkers((prev) =>
                prev.map((m) =>
                    m.id === visitTarget.id
                        ? { ...m, statusRaw: chosenStatus, statusNorm: norm(chosenStatus), rev: (m.rev || 0) + 1 }
                        : m
                )
            );

            await incrementUserStats(chosenStatus);

            setVisitModalOpen(false);
            setVisitTarget(null);
            Alert.alert('Succès', 'Statut mis à jour.');
        } catch (err) {
            console.error('❌ confirmStatusOnly:', err);
            Alert.alert('Erreur', "Mise à jour du statut impossible.");
        } finally {
            setSavingVisit(false);
        }
    };

    const searchAgentByCode = async () => {
        if (!agentCode.trim()) return;
        try {
            setSearchingAgent(true);
            const { data, error } = await supabase
                .from('users')
                .select('id, nom_complet, code_agent')
                .eq('code_agent', agentCode.trim())
                .single();

            if (error || !data) {
                throw new Error(error?.message || 'Agent non trouvé');
            }
            setFoundAgent(data);
        } catch (err) {
            console.error('❌ searchAgentByCode:', err);
            Alert.alert('Erreur', "Code agent invalide ou non trouvé.");
            setFoundAgent(null);
        } finally {
            setSearchingAgent(false);
        }
    };
    const submitVisit = async () => {
        if (!visitTarget) {
            Alert.alert('Info', "Aucune adresse sélectionnée.");
            return;
        }

        const mustAttach = visitForm.method === 'chèque' || visitForm.method === 'virement bancaire';
        try {
            setSavingVisit(true);

            let justificatifHex = null;
            if (mustAttach && visitForm.attachment?.uri) {
                justificatifHex = await fileToHexBytea(visitForm.attachment.uri);
            }

            const payload = {
                collector_id: Number(user.id),
                [AD_COL]: Number(visitTarget.id),
                donor_name: visitForm.donor_name,
                donor_email: consentEmail ? (visitForm.donor_email || null) : null,
                donor_gsm: visitForm.donor_gsm || null,
                total_donation: visitForm.total_donation,
                method: visitForm.method === 'autre' ? visitForm.method_other : visitForm.method,
                justificatif: justificatifHex,
                date: new Date().toISOString(),
            };

            const { error: insErr } = await supabase.from(VISITS_TABLE).insert(payload);
            if (insErr) throw insErr;

            const chosenStatus = chosenVisitStatus;
            const { error: upErr } = await supabase
                .from('donor_addresses')
                .update({ status: chosenStatus })
                .eq('id', visitTarget.id);
            if (upErr) throw upErr;

            setMarkers((prev) =>
                prev.map((m) =>
                    m.id === visitTarget.id
                        ? { ...m, statusRaw: chosenStatus, statusNorm: norm(chosenStatus), rev: (m.rev || 0) + 1 }
                        : m
                )
            );

            // incrémentation production + statut
            await incrementUserStats(chosenStatus);

            // --- calcul et enregistrement de la commission ---
            const donationValue = Number(visitForm.total_donation || 0);
            if (donationValue > 0) {
                const commission = donationValue * 0.35;
                await supabase.from('wallet').insert({
                    user_id: user.id,
                    commission,
                    created_at: new Date().toISOString(),
                });
                await loadTodayCommission(); // refresh compteur
            }

            setVisitModalOpen(false);
            setVisitTarget(null);
            Alert.alert('Succès', 'Donation enregistrée et statut mis à jour.');
        } catch (err) {
            console.error('❌ submitVisit:', err);
            Alert.alert('Erreur', "Enregistrement impossible.");
        } finally {
            setSavingVisit(false);
        }
    };

    const shareAddressesWithAgent = async () => {
        if (!foundAgent || !user?.id) return;
        try {
            setSharingAddresses(true);

            // 1) Load my addresses
            const { data: addresses, error: addrError } = await supabase
                .from('donor_addresses')
                .select('address,ville,location_lat,location_lng,status')
                .eq(FK_COL, user.id);
            if (addrError) throw addrError;
            if (!addresses?.length) {
                Alert.alert('Info', "Vous n'avez aucune adresse à partager.");
                return;
            }

            // 2) Build session token + dates
            const now = new Date();
            const expires = new Date(now.getTime() + 8 * 60 * 60 * 1000);
            const token =
                (typeof crypto !== 'undefined' && crypto.randomUUID)
                    ? crypto.randomUUID()
                    : `${user.id}-${now.getTime()}`;

            // 3) Insert copies for the recipient with shared_* markers
            const copies = addresses.map(a => ({
                address: a.address,
                ville: a.ville,
                location_lat: a.location_lat,
                location_lng: a.location_lng,
                status: a.status,
                [FK_COL]: foundAgent.id,

                shared_token: token,
                shared_from_user_id: user.id,
                shared_started_at: now.toISOString(),
                shared_expires_at: expires.toISOString(),
            }));

            const { error: insertError } = await supabase.from('donor_addresses').insert(copies);
            if (insertError) throw insertError;

            Alert.alert('Succès', `Adresses partagées avec ${foundAgent.nom_complet} (expire dans 8h)`);
            setShareModalOpen(false);
            setAgentCode('');
            setFoundAgent(null);
            await loadActiveShareSessions();
        } catch (err) {
            console.error('❌ shareAddressesWithAgent:', err);
            Alert.alert('Erreur', "Échec du partage des adresses.");
        } finally {
            setSharingAddresses(false);
        }
    };

    // Stop sharing now (delete copies for this token)
    const stopShareNow = async (token) => {
        try {
            const { error } = await supabase
                .from('donor_addresses')
                .delete()
                .eq('shared_token', token)
                .eq('shared_from_user_id', user.id);
            if (error) throw error;

            Alert.alert('Succès', 'Partage arrêté.');
            setShareInfoOpen(false);
            await loadActiveShareSessions();
        } catch (e) {
            console.error('stopShareNow', e);
            Alert.alert('Erreur', "Impossible d'arrêter le partage.");
        }
    };

    // --- Map helpers: zoom & fit ---
    const animateToRegion = (r, duration = 250) => {
        if (mapRef.current && r) mapRef.current.animateToRegion(r, duration);
    };

    const zoom = (factor) => {
        if (!region) return;
        const next = {
            ...region,
            latitudeDelta: Math.max(0.001, region.latitudeDelta * factor),
            longitudeDelta: Math.max(0.001, region.longitudeDelta * factor),
        };
        animateToRegion(next);
    };

    const zoomIn = () => zoom(0.5);
    const zoomOut = () => zoom(2);

    const fitAllMarkers = () => {
        if (!mapRef.current || filteredMarkers.length === 0) return;
        mapRef.current.fitToCoordinates(
            filteredMarkers.map(m => m.coordinate),
            { edgePadding: { top: 60, bottom: 60, left: 60, right: 60 }, animated: true }
        );
    };

    const getAndroidMarker = (status) => {
        const color = (() => {
            switch (status) {
                case 'visité et accepté': return '#7ED321';
                case 'visité et refusé':  return '#D0021B';
                case 'absent':            return '#F5A623';
                case 'non visité':        return '#9B9B9B';
                default:                  return '#9B9B9B';
            }
        })();

        return (
            <View style={[styles.markerCircle, { backgroundColor: color }]}>
                <FontAwesome name="home" size={18} color="white" />
            </View>
        );
    };

    if (!region) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Counter */}
            <View style={styles.counterBox}>
                <MaterialIcons name="home" size={16} color="#111" />
                <Text style={styles.counterText}> {filteredMarkers.length} adresses</Text>
            </View>
            {/* Compteur commission */}
            <View style={styles.commissionBox}>
                <MaterialIcons name="payments" size={16} color="#111" />
                <Text style={styles.commissionText}>
                    {todayCommission.toFixed(2)} MAD
                </Text>
            </View>

            {/* Nouveau bouton flottant */}
            <Pressable
                onPress={openDirectVisitModal}
                style={({ pressed }) => [
                    styles.directVisitBtn,
                    pressed && styles.btnPressed
                ]}
                android_ripple={{ color: 'rgba(0,0,0,0.08)' }}
            >
                <MaterialIcons name="add" size={22} color="#fff" />
                <Text style={styles.directVisitBtnText}>Nouvelle visite</Text>
            </Pressable>

            {/* Right-bottom filters & share */}
            <View style={styles.filtersVertical}>
                <Pressable
                    onPress={() => {
                        if (activeSessions.length > 0) setShareInfoOpen(true);
                        else setShareModalOpen(true);
                    }}
                    style={({ pressed }) => [
                        styles.shareBtn,
                        activeSessions.length > 0 && { backgroundColor: '#16a34a', borderColor: '#15803d' },
                        pressed && styles.btnPressed
                    ]}
                    android_ripple={{ color: 'rgba(0,0,0,0.08)' }}
                >
                    <MaterialIcons name="share" size={16} color="#fff" />
                    <Text style={styles.shareBtnText}>{activeSessions.length > 0 ? 'Partage actif' : 'Partager'}</Text>
                </Pressable>

                <ScrollView contentContainerStyle={{ gap: 8, marginTop: 8 }}>
                    {Object.values(STATUS_CONFIG).map((cfg) => {
                        const active = selectedStatuses.has(cfg.key);
                        return (
                            <Pressable
                                key={cfg.key}
                                onPress={() => toggleStatus(cfg.key)}
                                style={[
                                    styles.vChip,
                                    { borderColor: cfg.color, backgroundColor: active ? `${cfg.color}22` : 'white' },
                                ]}
                            >
                                <View style={[styles.dot, { backgroundColor: cfg.color }]} />
                                <Text style={styles.vChipText}>{cfg.label}</Text>
                            </Pressable>
                        );
                    })}
                </ScrollView>
            </View>

            <MapView
                ref={mapRef}
                provider={PROVIDER_GOOGLE}
                style={styles.map}
                showsUserLocation={!!hasPermission}
                followsUserLocation={!!hasPermission}
                initialRegion={region}
                onRegionChangeComplete={(r) => setRegion(r)}
            >
                {filteredMarkers.map((m) => {
                    const cfg =
                        m.statusNorm === 'non visité' ? STATUS_CONFIG['non visité'] :
                            m.statusNorm === 'visité et accepté' ? STATUS_CONFIG['visité et accepté'] :
                                m.statusNorm === 'visité et refusé' ? STATUS_CONFIG['visité et refusé'] :
                                    STATUS_CONFIG['absent'];

                    return (
                        <Marker
                            key={`${m.id}-${m.rev ?? 0}`}
                            coordinate={m.coordinate}
                            tappable={true}
                            tracksViewChanges={Platform.OS === 'android' ? true : tracksViewChanges}
                            onPress={() => setSelectedMarker(m)}
                            anchor={{ x: 0.5, y: 1 }}
                            zIndex={1}
                        >
                            {Platform.OS === 'android'
                                ? getAndroidMarker(m.statusNorm)
                                : (
                                    <View style={[
                                        styles.markerBubble,
                                        { borderColor: cfg.color, shadowColor: cfg.color }
                                    ]}>
                                        <MaterialIcons
                                            name="place"
                                            size={MARKER_SIZE}
                                            color={cfg.color}
                                        />
                                    </View>
                                )
                            }
                        </Marker>
                    );
                })}
            </MapView>
            {/* Modal marker info */}
            <Modal
                transparent
                visible={!!selectedMarker}
                animationType="slide"
                onRequestClose={() => setSelectedMarker(null)}
            >
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalCard}>
                        {selectedMarker ? (
                            <>
                                <View style={styles.modalHeader}>
                                    <MaterialIcons name="place" size={22} color="#111" />
                                    <Text style={styles.modalTitle} numberOfLines={2}>{selectedMarker.title}</Text>
                                </View>

                                <View style={styles.modalBody}>
                                    {selectedMarker.ville ? <Text style={styles.modalLine}>Ville : {selectedMarker.ville}</Text> : null}
                                    {selectedMarker.statusRaw ? <Text style={styles.modalLine}>Statut : {selectedMarker.statusRaw}</Text> : null}
                                </View>

                                <View style={styles.modalActions}>
                                    <Pressable
                                        onPress={() => openDirections(selectedMarker.coordinate.latitude, selectedMarker.coordinate.longitude, selectedMarker.title)}
                                        style={({ pressed }) => [styles.btn, styles.btnNeutral, pressed && styles.btnPressed]}
                                        android_ripple={{ color: 'rgba(0,0,0,0.08)' }}
                                    >
                                        <MaterialIcons name="directions" size={18} color="#fff" />
                                        <Text style={styles.btnText}>Itinéraire</Text>
                                    </Pressable>

                                    <Pressable
                                        onPress={() => {
                                            setVisitTarget(selectedMarker);
                                            setSelectedMarker(null);
                                            openStatusStep();
                                        }}
                                        style={({ pressed }) => [styles.btn, styles.btnDark, pressed && styles.btnPressed]}
                                        android_ripple={{ color: 'rgba(0,0,0,0.08)' }}
                                    >
                                        <MaterialIcons name="assignment" size={18} color="#fff" />
                                        <Text style={styles.btnText}>Enregistrer visite</Text>
                                    </Pressable>
                                </View>

                                <Pressable style={({ pressed }) => [styles.modalClose, pressed && { opacity: 0.8 }]} onPress={() => setSelectedMarker(null)}>
                                    <MaterialIcons name="close" size={20} color="#111" />
                                </Pressable>
                            </>
                        ) : null}
                    </View>
                </View>
            </Modal>

            {/* Nouveau modal pour l'enregistrement direct de visite */}
            <Modal
                transparent
                visible={directVisitModalOpen}
                animationType="slide"
                onRequestClose={closeDirectVisitModal}
            >
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            <MaterialIcons name="assignment" size={22} color="#111" />
                            <Text style={styles.modalTitle}>Enregistrer une nouvelle visite</Text>
                        </View>

                        <View style={[styles.vChip, { alignSelf: 'flex-start', borderColor: STATUS_CONFIG['visité et accepté'].color, backgroundColor: '#eafaf1' }]}>
                            <View style={[styles.dot, { backgroundColor: STATUS_CONFIG['visité et accepté'].color }]} />
                            <Text style={styles.vChipText}>Visité et accepté</Text>
                        </View>

                        <View style={styles.formRow}>
                            <Text style={styles.label}>Nom du donateur </Text>
                            <TextInput
                                value={visitForm.donor_name}
                                onChangeText={(t) => setVF({ donor_name: t })}
                                placeholder="Nom et prénom"
                                style={styles.input}
                            />
                        </View>

                        <View style={[styles.formRow, { marginTop: -2 }]}>
                            <Pressable
                                style={styles.checkboxRow}
                                onPress={() => {
                                    setConsentEmail((v) => {
                                        const next = !v;
                                        if (!next) setVF({ donor_email: '' });
                                        return next;
                                    });
                                }}
                            >
                                <View style={[styles.checkbox, consentEmail && styles.checkboxChecked]}>
                                    {consentEmail ? <MaterialIcons name="check" size={14} color="#fff" /> : null}
                                </View>
                                <Text style={styles.checkboxLabel}>Le donateur accepte de partager son email</Text>
                            </Pressable>
                        </View>

                        <View style={styles.formRow}>
                            <Text style={styles.label}>Email</Text>
                            <TextInput
                                value={visitForm.donor_email}
                                onChangeText={(t) => setVF({ donor_email: t })}
                                placeholder="ex: nom@domaine.com"
                                keyboardType="email-address"
                                autoCapitalize="none"
                                style={[styles.input, !consentEmail && styles.inputDisabled]}
                                editable={consentEmail}
                            />
                        </View>

                        <View style={styles.formRow}>
                            <Text style={styles.label}>Téléphone</Text>
                            <TextInput
                                value={visitForm.donor_gsm}
                                onChangeText={(t) => setVF({ donor_gsm: t })}
                                keyboardType="phone-pad"
                                style={styles.input}
                            />
                        </View>

                        <View style={styles.formRow}>
                            <Text style={styles.label}>Montant </Text>
                            <TextInput
                                value={visitForm.total_donation}
                                onChangeText={(t) => setVF({ total_donation: t })}
                                placeholder=""
                                keyboardType="numeric"
                                style={styles.input}
                            />
                        </View>

                        <View style={styles.formRow}>
                            <Text style={styles.label}>Méthode</Text>
                            <View style={styles.methods}>
                                {['espece', 'Square','chèque', 'virement bancaire', 'autre'].map((m) => (
                                    <Pressable
                                        key={m}
                                        onPress={() => setVF({ method: m })}
                                        style={[styles.methodBtn, visitForm.method === m && styles.methodBtnActive]}
                                    >
                                        <Text style={[styles.methodText, visitForm.method === m && styles.methodTextActive]}>{m}</Text>
                                    </Pressable>
                                ))}
                            </View>
                        </View>

                        {visitForm.method === 'autre' && (
                            <View style={styles.formRow}>
                                <Text style={styles.label}>Préciser </Text>
                                <TextInput
                                    value={visitForm.method_other}
                                    onChangeText={(t) => setVF({ method_other: t })}
                                    placeholder="ex: carte cadeau"
                                    style={styles.input}
                                />
                            </View>
                        )}

                        {(visitForm.method === 'chèque' || visitForm.method === 'virement bancaire') && (
                            <View style={styles.formRow}>
                                <Text style={styles.label}>Justificatif (PDF / image) *</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <Pressable
                                        style={({ pressed }) => [styles.pickBtn, pressed && { opacity: 0.85, transform: [{ translateY: 1 }] }]}
                                        onPress={onPickAttachment}
                                        android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
                                    >
                                        <MaterialIcons name="attach-file" size={18} color="#111" />
                                        <Text style={{ fontWeight: '700' }}>Choisir un fichier</Text>
                                    </Pressable>
                                    {visitForm.attachment ? (
                                        <Text numberOfLines={1} style={{ flex: 1 }}>{visitForm.attachment.name}</Text>
                                    ) : null}
                                </View>
                            </View>
                        )}

                        <View style={styles.modalActions}>
                            <Pressable
                                disabled={savingVisit}
                                onPress={submitDirectVisit}
                                style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.btnPressed, savingVisit && styles.btnDisabled]}
                                android_ripple={{ color: 'rgba(0,0,0,0.08)' }}
                            >
                                <MaterialIcons name="save" size={18} color="#fff" />
                                <Text style={styles.btnText}>{savingVisit ? 'Enregistrement...' : 'Enregistrer'}</Text>
                            </Pressable>

                            <Pressable
                                onPress={closeDirectVisitModal}
                                style={({ pressed }) => [styles.btn, styles.btnNeutral, pressed && styles.btnPressed]}
                                android_ripple={{ color: 'rgba(0,0,0,0.08)' }}
                            >
                                <MaterialIcons name="close" size={18} color="#fff" />
                                <Text style={styles.btnText}>Annuler</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Modal 1: choose status */}
            <Modal
                transparent
                visible={statusModalOpen}
                animationType="slide"
                onRequestClose={() => setStatusModalOpen(false)}
            >
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            <MaterialIcons name="assignment-ind" size={22} color="#111" />
                            <Text style={styles.modalTitle}>Statut de la visite</Text>
                        </View>

                        <View style={styles.formRow}>
                            <View style={styles.methods}>
                                {['visité et accepté', 'visité et refusé', 'absent', 'non visité'].map((s) => (
                                    <Pressable
                                        key={s}
                                        onPress={() => setChosenVisitStatus(s)}
                                        style={[
                                            styles.methodBtn,
                                            chosenVisitStatus === s && styles.methodBtnActive
                                        ]}
                                    >
                                        <Text style={[
                                            styles.methodText,
                                            chosenVisitStatus === s && styles.methodTextActive
                                        ]}>
                                            {s}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                        </View>

                        <View style={styles.modalActions}>
                            <Pressable
                                onPress={proceedAfterStatus}
                                style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.btnPressed]}
                                android_ripple={{ color: 'rgba(0,0,0,0.08)' }}
                            >
                                <MaterialIcons name="arrow-forward" size={18} color="#fff" />
                                <Text style={styles.btnText}>Continuer</Text>
                            </Pressable>

                            <Pressable
                                onPress={() => { setStatusModalOpen(false); setVisitTarget(null); }}
                                style={({ pressed }) => [styles.btn, styles.btnNeutral, pressed && styles.btnPressed]}
                                android_ripple={{ color: 'rgba(0,0,0,0.08)' }}
                            >
                                <MaterialIcons name="close" size={18} color="#fff" />
                                <Text style={styles.btnText}>Annuler</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Modal 2: donation form or confirmation */}
            <Modal
                transparent
                visible={visitModalOpen}
                animationType="slide"
                onRequestClose={() => { setVisitModalOpen(false); setVisitTarget(null); }}
            >
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            <MaterialIcons name="assignment" size={22} color="#111" />
                            <Text style={styles.modalTitle}>
                                {chosenVisitStatus === 'visité et accepté' ? 'Enregistrer la visite' : 'Confirmer le statut'}
                            </Text>
                        </View>

                        {chosenVisitStatus === 'visité et accepté' ? (
                            <>
                                <View style={[styles.vChip, { alignSelf: 'flex-start', borderColor: STATUS_CONFIG['visité et accepté'].color, backgroundColor: '#eafaf1' }]}>
                                    <View style={[styles.dot, { backgroundColor: STATUS_CONFIG['visité et accepté'].color }]} />
                                    <Text style={styles.vChipText}>Visité et accepté</Text>
                                </View>

                                <View style={styles.formRow}>
                                    <Text style={styles.label}>Nom du donateur</Text>
                                    <TextInput
                                        value={visitForm.donor_name}
                                        onChangeText={(t) => setVF({ donor_name: t })}
                                        placeholder="Nom et prénom"
                                        style={styles.input}
                                    />
                                </View>
                                <View style={[styles.formRow, { marginTop: -2 }]}>
                                    <Pressable
                                        style={styles.checkboxRow}
                                        onPress={() => {
                                            setConsentEmail((v) => {
                                                const next = !v;
                                                if (!next) setVF({ donor_email: '' });
                                                return next;
                                            });
                                        }}
                                    >
                                        <View style={[styles.checkbox, consentEmail && styles.checkboxChecked]}>
                                            {consentEmail ? <MaterialIcons name="check" size={14} color="#fff" /> : null}
                                        </View>
                                        <Text style={styles.checkboxLabel}>Le donateur accepte de partager son email</Text>
                                    </Pressable>
                                </View>

                                <View style={styles.formRow}>
                                    <Text style={styles.label}>Email</Text>
                                    <TextInput
                                        value={visitForm.donor_email}
                                        onChangeText={(t) => setVF({ donor_email: t })}
                                        placeholder="ex: nom@domaine.com"
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                        style={[styles.input, !consentEmail && styles.inputDisabled]}
                                        editable={consentEmail}
                                    />
                                </View>

                                <View style={styles.formRow}>
                                    <Text style={styles.label}>Téléphone</Text>
                                    <TextInput
                                        value={visitForm.donor_gsm}
                                        onChangeText={(t) => setVF({ donor_gsm: t })}
                                        keyboardType="phone-pad"
                                        style={styles.input}
                                    />
                                </View>

                                <View style={styles.formRow}>
                                    <Text style={styles.label}>Montant</Text>
                                    <TextInput
                                        value={visitForm.total_donation}
                                        onChangeText={(t) => setVF({ total_donation: t })}
                                        placeholder=""
                                        keyboardType="numeric"
                                        style={styles.input}
                                    />
                                </View>
                                <View style={styles.formRow}>
                                    <Text style={styles.label}>Méthode</Text>
                                    <View style={styles.methods}>
                                        {['espece','Square', 'chèque', 'virement bancaire', 'autre'].map((m) => (
                                            <Pressable
                                                key={m}
                                                onPress={() => setVF({ method: m })}
                                                style={[styles.methodBtn, visitForm.method === m && styles.methodBtnActive]}
                                            >
                                                <Text style={[styles.methodText, visitForm.method === m && styles.methodTextActive]}>{m}</Text>
                                            </Pressable>
                                        ))}
                                    </View>
                                </View>
                                {visitForm.method === 'autre' && (
                                    <View style={styles.formRow}>
                                        <Text style={styles.label}>Préciser *</Text>
                                        <TextInput
                                            value={visitForm.method_other}
                                            onChangeText={(t) => setVF({ method_other: t })}
                                            placeholder="ex: carte cadeau"
                                            style={styles.input}
                                        />
                                    </View>
                                )}

                                {(visitForm.method === 'chèque' || visitForm.method === 'virement bancaire') && (
                                    <View style={styles.formRow}>
                                        <Text style={styles.label}>Justificatif (PDF / image) </Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                            <Pressable
                                                style={({ pressed }) => [styles.pickBtn, pressed && { opacity: 0.85, transform: [{ translateY: 1 }] }]}
                                                onPress={onPickAttachment}
                                                android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
                                            >
                                                <MaterialIcons name="attach-file" size={18} color="#111" />
                                                <Text style={{ fontWeight: '700' }}>Choisir un fichier</Text>
                                            </Pressable>
                                            {visitForm.attachment ? (
                                                <Text numberOfLines={1} style={{ flex: 1 }}>{visitForm.attachment.name}</Text>
                                            ) : null}
                                        </View>
                                    </View>
                                )}

                                <View style={styles.modalActions}>
                                    <Pressable
                                        disabled={savingVisit}
                                        onPress={submitVisit}
                                        style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.btnPressed, savingVisit && styles.btnDisabled]}
                                        android_ripple={{ color: 'rgba(0,0,0,0.08)' }}
                                    >
                                        <MaterialIcons name="save" size={18} color="#fff" />
                                        <Text style={styles.btnText}>{savingVisit ? 'Enregistrement...' : 'Enregistrer'}</Text>
                                    </Pressable>

                                    <Pressable
                                        onPress={() => { setVisitModalOpen(false); setVisitTarget(null); }}
                                        style={({ pressed }) => [styles.btn, styles.btnNeutral, pressed && styles.btnPressed]}
                                        android_ripple={{ color: 'rgba(0,0,0,0.08)' }}
                                    >
                                        <MaterialIcons name="close" size={18} color="#fff" />
                                        <Text style={styles.btnText}>Annuler</Text>
                                    </Pressable>
                                </View>
                            </>
                        ) : (
                            <>
                                <View style={styles.formRow}>
                                    <Text style={styles.label}>Adresse</Text>
                                    <Text style={styles.modalLine}>
                                        {visitTarget?.title} {visitTarget?.ville ? `· ${visitTarget.ville}` : ''}
                                    </Text>
                                </View>
                                <View style={[styles.vChip, { alignSelf: 'flex-start', borderColor: STATUS_CONFIG[chosenVisitStatus].color, backgroundColor: '#f7f7f7' }]}>
                                    <View style={[styles.dot, { backgroundColor: STATUS_CONFIG[chosenVisitStatus].color }]} />
                                    <Text style={styles.vChipText}>{chosenVisitStatus}</Text>
                                </View>

                                <View style={styles.modalActions}>
                                    <Pressable
                                        disabled={savingVisit}
                                        onPress={confirmStatusOnly}
                                        style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.btnPressed, savingVisit && styles.btnDisabled]}
                                        android_ripple={{ color: 'rgba(0,0,0,0.08)' }}
                                    >
                                        <MaterialIcons name="save" size={18} color="#fff" />
                                        <Text style={styles.btnText}>{savingVisit ? 'Mise à jour...' : 'Enregistrer'}</Text>
                                    </Pressable>

                                    <Pressable
                                        onPress={() => { setVisitModalOpen(false); setVisitTarget(null); }}
                                        style={({ pressed }) => [styles.btn, styles.btnNeutral, pressed && styles.btnPressed]}
                                        android_ripple={{ color: 'rgba(0,0,0,0.08)' }}
                                    >
                                        <MaterialIcons name="close" size={18} color="#fff" />
                                        <Text style={styles.btnText}>Annuler</Text>
                                    </Pressable>
                                </View>
                            </>
                        )}
                    </View>
                </View>
            </Modal>

            {/* Share modal (start sharing) */}
            <Modal
                transparent
                visible={shareModalOpen}
                animationType="slide"
                onRequestClose={() => {
                    setShareModalOpen(false);
                    setAgentCode('');
                    setFoundAgent(null);
                }}
            >
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalCard}>
                        <View className="header" style={styles.modalHeader}>
                            <MaterialIcons name="person-add" size={22} color="#111" />
                            <Text style={styles.modalTitle}>Partager des adresses</Text>
                        </View>

                        <View style={styles.formRow}>
                            <Text style={styles.label}>Code agent du destinataire</Text>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                <TextInput
                                    value={agentCode}
                                    onChangeText={setAgentCode}
                                    placeholder="ex: AGT123"
                                    style={[styles.input, { flex: 1 }]}
                                    autoCapitalize="characters"
                                />
                                <Pressable
                                    onPress={searchingAgent ? undefined : searchAgentByCode}
                                    disabled={searchingAgent || !agentCode.trim()}
                                    style={({ pressed }) => [
                                        styles.btn,
                                        styles.btnNeutral,
                                        pressed && styles.btnPressed,
                                        (searchingAgent || !agentCode.trim()) && styles.btnDisabled
                                    ]}
                                >
                                    <MaterialIcons name="search" size={18} color="#fff" />
                                    <Text style={styles.btnText}>{searchingAgent ? '...' : 'Chercher'}</Text>
                                </Pressable>
                            </View>
                        </View>

                        {foundAgent && (
                            <>
                                <View style={styles.formRow}>
                                    <Text style={styles.label}>Agent trouvé :</Text>
                                    <View style={styles.agentCard}>
                                        <MaterialIcons name="person" size={20} color="#3b82f6" />
                                        <Text style={styles.agentName}>{foundAgent.nom_complet}</Text>
                                    </View>
                                    <Text style={[styles.modalLine, { marginTop: 12 }]}>
                                        Vous êtes sur le point de partager {filteredMarkers.length} adresse(s) avec cet agent.
                                        Elles apparaîtront dans sa carte et expireront automatiquement.
                                    </Text>
                                </View>

                                <View style={styles.modalActions}>
                                    <Pressable
                                        onPress={shareAddressesWithAgent}
                                        disabled={sharingAddresses}
                                        style={({ pressed }) => [
                                            styles.btn,
                                            styles.btnPrimary,
                                            pressed && styles.btnPressed,
                                            sharingAddresses && styles.btnDisabled
                                        ]}
                                    >
                                        <MaterialIcons name="check" size={18} color="#fff" />
                                        <Text style={styles.btnText}>
                                            {sharingAddresses ? 'Partage en cours...' : 'Confirmer le partage'}
                                        </Text>
                                    </Pressable>

                                    <Pressable
                                        onPress={() => {
                                            setShareModalOpen(false);
                                            setAgentCode('');
                                            setFoundAgent(null);
                                        }}
                                        style={({ pressed }) => [styles.btn, styles.btnNeutral, pressed && styles.btnPressed]}
                                    >
                                        <MaterialIcons name="close" size={18} color="#fff" />
                                        <Text style={styles.btnText}>Annuler</Text>
                                    </Pressable>
                                </View>
                            </>
                        )}

                        <Pressable
                            style={styles.modalClose}
                            onPress={() => {
                                setShareModalOpen(false);
                                setAgentCode('');
                                setFoundAgent(null);
                            }}
                        >
                            <MaterialIcons name="close" size={20} color="#111" />
                        </Pressable>
                    </View>
                </View>
            </Modal>

            {/* Active share info modal */}
            <Modal
                transparent
                visible={shareInfoOpen}
                animationType="slide"
                onRequestClose={() => setShareInfoOpen(false)}
            >
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            <MaterialIcons name="share" size={22} color="#111" />
                            <Text style={styles.modalTitle}>Partage en cours</Text>
                        </View>

                        {activeSessions.length === 0 ? (
                            <Text style={styles.modalLine}>Aucun partage actif.</Text>
                        ) : (
                            (() => {
                                const s = activeSessions[0];
                                const started = new Date(s.shared_started_at);
                                const expires = new Date(s.shared_expires_at);
                                const minsLeft = Math.max(0, Math.round((expires - new Date()) / 60000));
                                return (
                                    <>
                                        <Text style={styles.modalLine}>Démarré : {started.toLocaleString()}</Text>
                                        <Text style={styles.modalLine}>Expire : {expires.toLocaleString()} ({minsLeft} min restantes)</Text>
                                        <Text style={[styles.modalLine, { opacity: 0.7 }]}>Adresses copiées : {s.count}</Text>

                                        <View style={styles.modalActions}>
                                            <Pressable
                                                onPress={() => stopShareNow(s.shared_token)}
                                                style={({ pressed }) => [styles.btn, styles.btnDark, pressed && styles.btnPressed]}
                                            >
                                                <MaterialIcons name="stop" size={18} color="#fff" />
                                                <Text style={styles.btnText}>Stopper le partage</Text>
                                            </Pressable>

                                            <Pressable
                                                onPress={() => setShareInfoOpen(false)}
                                                style={({ pressed }) => [styles.btn, styles.btnNeutral, pressed && styles.btnPressed]}
                                            >
                                                <MaterialIcons name="close" size={18} color="#fff" />
                                                <Text style={styles.btnText}>Fermer</Text>
                                            </Pressable>
                                        </View>
                                    </>
                                );
                            })()
                        )}
                        <Pressable style={styles.modalClose} onPress={() => setShareInfoOpen(false)}>
                            <MaterialIcons name="close" size={20} color="#111" />
                        </Pressable>
                    </View>
                </View>
            </Modal>

            {/* Zoom controls */}
            <View style={styles.zoomControls}>
                <Pressable
                    onPress={zoomIn}
                    style={({ pressed }) => [styles.zoomBtn, pressed && styles.btnPressed]}
                    android_ripple={{ color: 'rgba(0,0,0,0.08)' }}
                >
                    <MaterialIcons name="add" size={20} color="#111" />
                </Pressable>
                <Pressable
                    onPress={zoomOut}
                    style={({ pressed }) => [styles.zoomBtn, pressed && styles.btnPressed]}
                    android_ripple={{ color: 'rgba(0,0,0,0.08)' }}
                >
                    <MaterialIcons name="remove" size={20} color="#111" />
                </Pressable>
            </View>
        </View>
    );
}


const styles = StyleSheet.create({
    container: { flex: 1 },
    map: { width: '100%', height: '100%' },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f8f9fa'
    },

    counterBox: {
        position: 'absolute',
        top: 12,
        left: 12,
        zIndex: 10,
        backgroundColor: 'rgba(255,255,255,0.9)',
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        shadowOpacity: 0.1,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
        elevation: 4,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)'
    },
    counterText: {
        fontWeight: '700',
        color: '#111',
        fontSize: 14
    },

    filtersVertical: {
        position: 'absolute',
        right: 12,
        bottom: 16,
        zIndex: 10,
        backgroundColor: 'transparent',
    },
    vChip: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1.5,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.95)',
        shadowOpacity: 0.1,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    vChipText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#2d3748'
    },
    dot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginRight: 8
    },
    markerCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 4,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 4,
    },

    markerContainerAndroid: {
        width: 150,
        height: 150,
        borderRadius: 15,
        backgroundColor: '#1e90ff',
        borderWidth: 2,
        borderColor: 'white',
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 2,
    },

    // Styles pour le cluster Android
    clusterMarkerAndroid: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#7c3aed',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 3,
        borderColor: 'white',
        elevation: 6,
    },

    countBadgeAndroid: {
        position: 'absolute',
        top: -5,
        right: -5,
        minWidth: 20,
        height: 20,
        borderRadius: 10,
        paddingHorizontal: 4,
        backgroundColor: '#ff4757',
        borderWidth: 2,
        borderColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 3,
    },
    commissionBox: {
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 10,
        backgroundColor: 'rgba(255,255,255,0.9)',
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        shadowOpacity: 0.1,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
        elevation: 4,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)'
    },
    commissionText: {
        fontWeight: '700',
        color: '#111',
        fontSize: 14,
        marginLeft: 6
    },
    countBadgeTextAndroid: {
        color: '#fff',
        fontWeight: '800',
        fontSize: 10,
        textAlign: 'center',
    },

    markerBubble: {
        backgroundColor: 'white',
        borderRadius: 18,
        padding: 8,
        borderWidth: 2,
        shadowOpacity: 0.2,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
        elevation: 4,
    },

    markerBubblePurple: {
        borderColor: '#7c3aed',
        shadowColor: '#7c3aed',
        backgroundColor: '#ffffff',
        position: 'relative',
    },

    countBadge: {
        position: 'absolute',
        top: -6,
        right: -6,
        minWidth: COUNT_BADGE_SIZE,
        height: COUNT_BADGE_SIZE,
        borderRadius: COUNT_BADGE_SIZE / 2,
        paddingHorizontal: 6,
        backgroundColor: '#7c3aed',
        borderWidth: 2,
        borderColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },

    countBadgeText: {
        color: '#fff',
        fontWeight: '800',
        fontSize: COUNT_BADGE_TEXT_SIZE,
    },

    callout: {
        minWidth: 220,
        maxWidth: 260,
        padding: 12,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.95)',
        shadowOpacity: 0.15,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
    },
    calloutTitle: {
        fontWeight: '700',
        fontSize: 15,
        marginBottom: 6,
        color: '#1a202c'
    },
    calloutLine: {
        fontSize: 13,
        marginBottom: 3,
        color: '#4a5568'
    },

    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16
    },
    modalCard: {
        width: '100%',
        maxWidth: 520,
        backgroundColor: 'white',
        borderRadius: 20,
        padding: 20,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)'
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingBottom: 12,
        marginBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.08)',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '800',
        flex: 1,
        color: '#1a202c'
    },
    modalBody: {
        marginVertical: 12
    },
    modalLine: {
        fontSize: 14,
        marginBottom: 6,
        color: '#4a5568'
    },

    modalActions: {
        marginTop: 16,
        gap: 12,
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center'
    },

    btn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 14,
        alignSelf: 'flex-start',
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
    },
    btnPrimary: {
        backgroundColor: '#3b82f6',
        borderWidth: 1,
        borderColor: '#2563eb'
    },
    btnDark: {
        backgroundColor: '#1e293b',
        borderWidth: 1,
        borderColor: '#0f172a'
    },
    btnNeutral: {
        backgroundColor: '#64748b',
        borderWidth: 1,
        borderColor: '#475569'
    },
    btnPressed: {
        opacity: 0.9,
        transform: [{ translateY: 1 }]
    },
    btnDisabled: {
        opacity: 0.7
    },

    btnText: {
        color: '#fff',
        fontWeight: '800',
        fontSize: 14
    },

    formRow: {
        marginBottom: 16
    },
    label: {
        fontWeight: '700',
        marginBottom: 8,
        color: '#1e293b',
        fontSize: 14
    },
    input: {
        backgroundColor: '#fff',
        borderWidth: 1.5,
        borderColor: '#e2e8f0',
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        color: '#1e293b'
    },
    inputDisabled: {
        backgroundColor: '#f8fafc',
        color: '#94a3b8'
    },

    methods: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10
    },
    methodBtn: {
        borderWidth: 1.5,
        borderColor: '#e2e8f0',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: '#fff',
        shadowOpacity: 0.05,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    methodBtnActive: {
        borderColor: '#3b82f6',
        backgroundColor: '#eff6ff'
    },
    methodText: {
        color: '#475569',
        fontWeight: '600'
    },
    methodTextActive: {
        fontWeight: '700',
        color: '#1d4ed8'
    },

    pickBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#f1f5f9',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderWidth: 1.5,
        borderColor: '#e2e8f0',
        shadowOpacity: 0.05,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    directVisitBtn: {
        position: 'absolute',
        bottom: 230,
        right: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#3b82f6',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 20,
        shadowOpacity: 0.2,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
        elevation: 6,
        zIndex: 20
    },
    directVisitBtnText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 14,
    },
    checkboxRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 12
    },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: 6,
        borderWidth: 1.5,
        borderColor: '#cbd5e1',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fff'
    },
    checkboxChecked: {
        backgroundColor: '#10b981',
        borderColor: '#10b981'
    },
    checkboxLabel: {
        fontSize: 14,
        color: '#334155',
        fontWeight: '600'
    },

    modalClose: {
        position: 'absolute',
        top: 14,
        right: 14,
        backgroundColor: '#f8fafc',
        borderRadius: 20,
        padding: 8,
        borderWidth: 1.5,
        borderColor: '#e2e8f0',
        shadowOpacity: 0.1,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
        elevation: 3,
    },

    shareBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#6366f1',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 14,
        justifyContent: 'center',
        shadowOpacity: 0.1,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
        elevation: 3,
        borderWidth: 1,
        borderColor: '#4f46e5',
    },
    shareBtnText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 13,
    },
    agentCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: '#f8fafc',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        marginTop: 8,
    },
    agentName: {
        fontWeight: '700',
        color: '#1e293b',
        fontSize: 15,
    },

    // --- Zoom controls ---
    zoomControls: {
        position: 'absolute',
        left: 12,
        bottom: 16,
        zIndex: 10,
        gap: 8,
    },
    zoomBtn: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderWidth: 1.5,
        borderColor: 'rgba(0,0,0,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        shadowOpacity: 0.1,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
        elevation: 3,
    },
});
