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
import * as Crypto from 'expo-crypto';
const SENDGRID_API_KEY = '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';
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
const FK_COL = 'collector_id';
const AD_COL = 'adress_id';
const VISITS_TABLE = 'donations';
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
    const [isTracking, setIsTracking] = useState(true);
    const locationSubscription = useRef(null);
    const [userPath, setUserPath] = useState([]);
    const [region, setRegion] = useState(null);
    const [hasPermission, setHasPermission] = useState(null);
    const [markers, setMarkers] = useState([]);
    const RECORDING_DISTANCE_THRESHOLD = 50;
    const [isRecording, setIsRecording] = useState(false);
    const [nearbyAddresses, setNearbyAddresses] = useState([]);
    const [lastRecordingTime, setLastRecordingTime] = useState(0);
    let globalRecording = null;
    let globalTimeout = null;
    const [selectedStatuses, setSelectedStatuses] = useState(new Set(Object.keys(STATUS_CONFIG)));
    const [selectedMarker, setSelectedMarker] = useState(null);
    const [statusModalOpen, setStatusModalOpen] = useState(false);
    const [visitModalOpen, setVisitModalOpen] = useState(false);
    const [chosenVisitStatus, setChosenVisitStatus] = useState('visité et accepté');
    const [visitTarget, setVisitTarget] = useState(null);
    const [savingVisit, setSavingVisit] = useState(false);
    const [liveTrackingActive, setLiveTrackingActive] = useState(false);
    const liveTrackingInterval = useRef(null);
    const lastSavedPosition = useRef(null);
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
    const [shareModalOpen, setShareModalOpen] = useState(false);
    const [agentCode, setAgentCode] = useState('');
    const [foundAgent, setFoundAgent] = useState(null);
    const [searchingAgent, setSearchingAgent] = useState(false);
    const [sharingAddresses, setSharingAddresses] = useState(false);
    const [activeSessions, setActiveSessions] = useState([]);
    const [shareInfoOpen, setShareInfoOpen] = useState(false);
    const sendVisitNotification = async (visitData) => {
        const msg = {
            personalizations: [{
                to: [{ email: visitData.donor_email }],
            }],
            from: { email: 'contact@novaadmin.ca' },
            subject: 'Merci pour votre donation - Azirm Fondation',
            content: [{
                type: 'text/html',
                value: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reçu - Azirm Fondation</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f9f9f9;
        }
        .receipt-container {
            background-color: #ffffff;
            border-radius: 8px;
            padding: 25px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 20px;
        }
        .main-title {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .subheader {
            font-size: 12px;
            color: #555;
            margin-bottom: 15px;
        }
        .thank-you {
            text-align: center;
            margin-bottom: 20px;
            font-size: 14px;
            line-height: 1.5;
        }
        .section {
            margin-bottom: 20px;
        }
        .section-title {
            font-size: 14px;
            font-weight: bold;
            text-align: center;
            margin-bottom: 10px;
            text-transform: uppercase;
        }
        .campaign-title {
            font-size: 14px;
            font-weight: bold;
            text-align: center;
            margin-bottom: 5px;
        }
        .detail-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
            font-size: 13px;
        }
        .detail-label {
            color: #555;
        }
        .social-links {
            display: flex;
            justify-content: center;
            gap: 15px;
            margin-top: 10px;
        }
        .social-link {
            display: inline-block;
            transition: transform 0.3s ease;
        }
        .social-link:hover {
            transform: scale(1.1);
        }
        .social-icon {
            width: 24px;
            height: 24px;
            filter: invert(40%) sepia(15%) saturate(1200%) hue-rotate(180deg) brightness(90%);
        }
        .detail-value {
            font-weight: 500;
        }
        .divider {
            height: 1px;
            background-color: #ddd;
            margin: 15px 0;
        }
        .footer {
            text-align: center;
            margin-top: 20px;
            font-size: 10px;
            color: #777;
        }
        .footer-links {
            margin-top: 5px;
            color: #333;
        }
        .bold {
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="receipt-container">
        <div class="header">
            <img src="https://azirm.ca/wp-content/uploads/2025/02/Asset-2@Post2.png" alt="Azirm Fondation" class="logo" />
            <div class="subheader">Offrir des sourires, changer des vies</div>
        </div>
        <div class="thank-you">
            Chaque enfant mérite de grandir avec espoir et bonheur. À la Fondation Azirm, nous apportons du réconfort aux enfants en situation de vulnérabilité en leur offrant des moments de joie et de soutien.
        </div>
        <div class="closing">On vous remercie et on vous souhaite une bonne journée!</div>
        <div class="section">
            <div class="campaign-info">
                <div class="detail-row">
                    <span class="detail-label">Azirm Fondation</span>
                </div>
            </div>
            <div class="footer">
                Créé par Azirm Fondation
                <div class="social-links">
    <a href="https://www.instagram.com/fondationazirm/?hl=fr" target="_blank" class="social-link">
        <img src="https://drive.google.com/uc?export=view&id=1Y0e5X2NQlQ7W8t6vZ9w7x4r3s2q1p0o" alt="Instagram" width="24" height="24" style="border:0; display:block;" />
    </a>
    <a href="https://azirm.ca/" target="_blank" class="social-link">
        <img src="https://drive.google.com/uc?export=view&id=1X9y8z7w6v5u4t3s2r1q0p9o8n7m6l5k" alt="Site Web" width="24" height="24" style="border:0; display:block;" />
    </a>
</div>
            </div>
        </div>
        
        <div class="divider"></div>
        <div class="section">
            <div class="section-title">Résumé de la transaction:</div>
            <div class="detail-row">
                <span class="detail-label"><strong>Date</strong></span>
                <span class="detail-value">${new Date().toLocaleDateString('fr-FR')}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label"><strong>Méthode de paiement:</strong></span>
                <span class="detail-value">${visitData.method}</span>
            </div>
            <div class="section-title" style="margin-top: 15px;">Informations de contact:</div>
            <div class="detail-row">
                <span class="detail-label"><strong>Email:</strong></span>
                <span class="detail-value">${visitData.donor_email || 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label"><strong>GSM:</strong></span>
                <span class="detail-value">${visitData.donor_gsm || 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label"><strong>Addresse:</strong></span>
                <span class="detail-value">${visitData.donor_address || 'N/A'}</span>
            </div>
            
            <div class="section-title" style="margin-top: 15px;">Sommaire</div>
            <div class="detail-row">
                <span class="detail-label"><strong>Montant de la donation:</strong></span>
                <span class="detail-value">$${parseFloat(visitData.total_donation || 0).toFixed(2)}</span>
            </div>
        </div>
        
        <div class="divider"></div>
        <div class="footer">
            <div>© 2025 Azirm Fondation. Tous Droits Réservés.</div>
        </div>
    </div>
</body>
</html>
            `,
            }],
        };

        try {
            const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${SENDGRID_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(msg),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            console.log('✅ Email envoyé avec succès');
        } catch (error) {
            console.error('❌ Erreur envoi email:', error);
        }
    };
    const sendReceiptIfConditionsMet = async (visitData, consent, status, donorAddress = '') => {
        if (status === 'visité et accepté' && consent && visitData.donor_email && visitData.donor_email.trim()) {
            await sendVisitNotification({
                donor_name: visitData.donor_name,
                donor_email: visitData.donor_email,
                donor_gsm: visitData.donor_gsm,
                total_donation: visitData.total_donation || 0,
                method: visitData.method === 'autre' ? visitData.method_other : visitData.method,
                donor_address: donorAddress
            });
        }
    };
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
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371000; // Rayon de la Terre en mètres
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a =
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    };
    // Ajouter cette fonction après calculateDistance
    const checkProximityToAddresses = async (currentCoords) => {
        if (!markers.length || isRecording) return;

        const nearby = [];
        const now = Date.now();

        // Éviter les enregistrements trop fréquents (au moins 30 secondes entre chaque)
        if (now - lastRecordingTime < 30000) return;

        for (const marker of markers) {
            const distance = calculateDistance(
                currentCoords.latitude,
                currentCoords.longitude,
                marker.coordinate.latitude,
                marker.coordinate.longitude
            );

            if (distance <= RECORDING_DISTANCE_THRESHOLD) {
                nearby.push({ ...marker, distance });
            }
        }

        setNearbyAddresses(nearby);
        if (nearby.length > 0 && !isRecording) {
            console.log('📍 Proche d\'une adresse, démarrage enregistrement...');
            await startRecordingAndSave(user.id);
            setLastRecordingTime(now);
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
    // Remplacer l'effet de localisation existant par ceci
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

            // Watch position avec détection de proximité
            // NOTE: Ce watchPositionAsync est maintenant uniquement pour la détection de proximité
            // Le tracking principal est géré par l'autre effet
            await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.High,
                    timeInterval: 5000,
                    distanceInterval: 10
                },
                async ({ coords: c }) => {
                    setRegion((r) => ({
                        latitude: c.latitude,
                        longitude: c.longitude,
                        latitudeDelta: r?.latitudeDelta ?? 0.02,
                        longitudeDelta: r?.longitudeDelta ?? 0.02,
                    }));
                    await checkProximityToAddresses(c);
                }
            );
        })();
    }, [isAuthenticated, user?.id, markers]);
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
    const startLiveTracking = async () => {
        if (liveTrackingActive || !hasPermission) return;

        try {
            setLiveTrackingActive(true);
            console.log('🎯 Démarrage du tracking en direct...');

            // Sauvegarder la position actuelle immédiatement
            const currentLocation = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.High
            });

            await saveLocationToDatabase(
                currentLocation.coords.latitude,
                currentLocation.coords.longitude
            );

            lastSavedPosition.current = {
                latitude: currentLocation.coords.latitude,
                longitude: currentLocation.coords.longitude
            };

            // Configurer le tracking en continu
            const subscription = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.High,
                    timeInterval: 30000, // Toutes les 30 secondes
                    distanceInterval: 10, // Ou quand l'utilisateur bouge de 10 mètres
                },
                async (location) => {
                    const { latitude, longitude } = location.coords;

                    // Vérifier si la position a suffisamment changé pour éviter le spam
                    if (lastSavedPosition.current) {
                        const distance = calculateDistance(
                            lastSavedPosition.current.latitude,
                            lastSavedPosition.current.longitude,
                            latitude,
                            longitude
                        );

                        // Sauvegarder seulement si l'utilisateur a bougé d'au moins 5 mètres
                        if (distance >= 5) {
                            await saveLocationToDatabase(latitude, longitude);
                            lastSavedPosition.current = { latitude, longitude };
                        }
                    } else {
                        await saveLocationToDatabase(latitude, longitude);
                        lastSavedPosition.current = { latitude, longitude };
                    }
                }
            );

            // Stocker la référence de l'abonnement pour pouvoir l'arrêter plus tard
            liveTrackingInterval.current = subscription;

        } catch (err) {
            console.error('❌ startLiveTracking:', err);
            setLiveTrackingActive(false);
            Alert.alert('Erreur', 'Impossible de démarrer le tracking de localisation.');
        }
    };
    const stopLiveTracking = () => {
        if (liveTrackingInterval.current) {
            liveTrackingInterval.current.remove();
            liveTrackingInterval.current = null;
        }
        setLiveTrackingActive(false);
        lastSavedPosition.current = null;
        console.log('🛑 Tracking en direct arrêté');
    };
    useEffect(() => {
        return () => {
            if (liveTrackingInterval.current) {
                liveTrackingInterval.current.remove();
            }
        };
    }, []);
    useEffect(() => {
        if (isAuthenticated && user?.id && hasPermission && !liveTrackingActive) {
            startLiveTracking();
        }
    }, [isAuthenticated, user?.id, hasPermission]);
    const saveLocationToDatabase = async (latitude, longitude) => {
        if (!user?.id) return;

        try {
            const locationData = {
                collector_id: Number(user.id),
                latitude: latitude,
                longitude: longitude,
                recorded_at: new Date().toISOString()
            };

            const { error } = await supabase
                .from('localisation_en_direct')
                .insert(locationData);

            if (error) {
                console.error('❌ Erreur sauvegarde localisation:', error);
            } else {
                console.log('✅ Position sauvegardée:', { latitude, longitude });
            }
        } catch (err) {
            console.error('❌ saveLocationToDatabase:', err);
        }
    };
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
    // Remplacer la fonction stopAndSaveRecording existante par ceci
    const stopAndSaveRecording = async (userId) => {
        try {
            if (!globalRecording) {
                setIsRecording(false);
                return;
            }

            console.log('⏹️ Arrêt de l\'enregistrement...');

            await globalRecording.stopAndUnloadAsync();
            const uri = globalRecording.getURI();

            if (uri) {
                const base64 = await FileSystem.readAsStringAsync(uri, {
                    encoding: FileSystem.EncodingType.Base64,
                });
                const hexData = base64ToHex(base64);

                await supabase.from('enregistrement_vocal').insert({
                    collector_id: Number(userId),
                    son: hexData,
                    created_at: new Date().toISOString(),
                    context: nearbyAddresses.length > 0 ? 'proximité_adresse' : 'nouvelle_visite',
                    nearby_addresses: nearbyAddresses.map(addr => addr.id).join(',')
                });

                console.log("✅ Enregistrement sauvegardé !");
            }

        } catch (e) {
            console.error("❌ stopAndSaveRecording:", e);
        } finally {
            setIsRecording(false);
            globalRecording = null;
            if (globalTimeout) {
                clearTimeout(globalTimeout);
                globalTimeout = null;
            }
        }
    };
    const startRecordingAndSave = async (userId) => {
        try {
            // Vérifier si on est déjà en train d'enregistrer
            if (isRecording) {
                console.log('⚠️ Enregistrement déjà en cours');
                return;
            }

            const { status } = await Audio.requestPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert("Permission refusée", "Activez le micro dans les paramètres.");
                return;
            }

            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });

            setIsRecording(true);
            console.log('🎤 Début de l\'enregistrement...');

            const { recording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );

            globalRecording = recording;

            // Auto-stop après 30 secondes
            globalTimeout = setTimeout(() => {
                stopAndSaveRecording(userId);
            }, 30000);

        } catch (err) {
            console.error("❌ startRecordingAndSave:", err);
            setIsRecording(false);
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

    // Remplacer la fonction openDirectVisitModal existante par ceci
    const openDirectVisitModal = async () => {
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

        // Démarrer l'enregistrement pour nouvelle visite
        await startRecordingAndSave(user.id);
    };
// Remplacer la fonction closeDirectVisitModal existante par ceci
    const closeDirectVisitModal = async () => {
        setDirectVisitModalOpen(false);
        setVisitTarget(null);

        // Arrêter l'enregistrement si c'était pour une nouvelle visite
        if (isRecording) {
            await stopAndSaveRecording(user.id);
        }
    };
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

            await incrementUserStats('visité et accepté');

            // ENVOI DU REÇU POUR LES VISITES DIRECTES
            await sendReceiptIfConditionsMet(visitForm, consentEmail, 'visité et accepté');

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
        setConsentEmail(false); // ← RESET IMPORTANT DU CONSENTEMENT
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

            // 🔥 INSERTION DANS HISTORIQUE_TAGUE
            const { error: histErr } = await supabase
                .from('historique_tague')
                .insert({
                    adress_id: Number(visitTarget.id),
                    collector_id: Number(user.id),
                    status: chosenStatus,
                    montant: 0, // Aucun montant pour les statuts sans donation
                    created_at: new Date().toISOString(),
                });
            if (histErr) throw histErr;

            setMarkers((prev) =>
                prev.map((m) =>
                    m.id === visitTarget.id
                        ? { ...m, statusRaw: chosenStatus, statusNorm: norm(chosenStatus), rev: (m.rev || 0) + 1 }
                        : m
                )
            );

            await incrementUserStats(chosenStatus);
            await sendReceiptIfConditionsMet(
                visitForm,
                consentEmail,
                chosenStatus,
                visitTarget.title
            );
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

            const { error: histErr } = await supabase
                .from('historique_tague')
                .insert({
                    adress_id: Number(visitTarget.id),
                    collector_id: Number(user.id),
                    status: chosenStatus,
                    montant: visitForm.total_donation || 0,
                    created_at: new Date().toISOString(),
                });
            if (histErr) throw histErr;

            setMarkers((prev) =>
                prev.map((m) =>
                    m.id === visitTarget.id
                        ? { ...m, statusRaw: chosenStatus, statusNorm: norm(chosenStatus), rev: (m.rev || 0) + 1 }
                        : m
                )
            );

            await incrementUserStats(chosenStatus);

            // ENVOI DU REÇU POUR LES VISITES NORMALES
            await sendReceiptIfConditionsMet(
                visitForm,
                consentEmail,
                chosenStatus,
                visitTarget.title
            );

            const donationValue = Number(visitForm.total_donation || 0);
            if (donationValue > 0) {
                const commission = donationValue * 0.35;
                await supabase.from('wallet').insert({
                    user_id: user.id,
                    commission,
                    created_at: new Date().toISOString(),
                });
                await loadTodayCommission();
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
                    {todayCommission.toFixed(2)}$
                </Text>

            </View>
            {isRecording && (
                <View style={styles.recordingIndicator}>
                    <MaterialIcons name="mic" size={16} color="#fff" />
                    <Text style={styles.recordingText}>Enregistrement...</Text>
                </View>
            )}
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
                region={region}
                onRegionChangeComplete={(r) => setRegion(r)}
                enableLatestRenderer
                loadingEnabled
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
    currentLocationMarker: {
        backgroundColor: 'white',
        borderRadius: 20,
        padding: 4,
        borderWidth: 2,
        borderColor: '#3498db'
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
// Ajouter ces styles à l'objet StyleSheet
    recordingIndicator: {
        position: 'absolute',
        top: 60,
        left: 12,
        zIndex: 10,
        backgroundColor: '#ef4444',
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        shadowOpacity: 0.2,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
        elevation: 4,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.1)'
    },
    recordingText: {
        fontWeight: '700',
        color: '#fff',
        fontSize: 14,
        marginLeft: 6
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
