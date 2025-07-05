import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,Modal,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';

const { width } = Dimensions.get('window');

export default function DashboardScreen() {
  const { user, userName } = useAuth();
  const navigation = useNavigation();
  const [collectorId, setCollectorId] = useState(null);
  const [totalDonations, setTotalDonations] = useState(0);
  const [realTimeHMS, setRealTimeHMS] = useState('0h 0m 0s');
  const [topDayAgents, setTopDayAgents] = useState([]);
  const [topWeekAgents, setTopWeekAgents] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [userProfileImage, setUserProfileImage] = useState('https://via.placeholder.com/150');
  const loginStartTimeRef = useRef(Date.now());
  const [showProfileOptions, setShowProfileOptions] = useState(false);
  useEffect(() => {
    if (user?.id) fetchDashboardData();
  }, [user]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const diffMs = now - loginStartTimeRef.current;
      const totalSeconds = Math.floor(diffMs / 1000);
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;
      setRealTimeHMS(`${h}h ${m}m ${s}s`);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  async function fetchDashboardData() {
    try {
      const { data: userData } = await supabase.from('users').select('profile_image').eq('id', user.id).single();
      if (userData?.profile_image) setUserProfileImage(userData.profile_image.trim());

      const { data: collector } = await supabase.from('collectors').select('id').eq('user_id', user.id).single();
      setCollectorId(collector?.id);

      const now = new Date();
      const startOfToday = new Date(now);
      startOfToday.setHours(23, 59, 0, 0);
      startOfToday.setDate(startOfToday.getDate() - 1);
      const endOfToday = new Date(startOfToday);
      endOfToday.setDate(endOfToday.getDate() + 1);
      endOfToday.setMilliseconds(999);

      const currentDate = new Date();
      const lastMonday = new Date(currentDate);
      lastMonday.setDate(currentDate.getDate() - ((currentDate.getDay() + 6) % 7));
      lastMonday.setHours(23, 59, 0, 0);
      const nextMonday = new Date(lastMonday);
      nextMonday.setDate(lastMonday.getDate() + 7);
      nextMonday.setMilliseconds(999);

      const [dayData, weekData] = await Promise.all([
        supabase.from('donations').select('collector_id, amount').gte('created_at', startOfToday.toISOString()).lte('created_at', endOfToday.toISOString()),
        supabase.from('donations').select('collector_id, amount').gte('created_at', lastMonday.toISOString()).lte('created_at', nextMonday.toISOString()),
      ]);

      const computeTop = (data) => {
        const grouped = data.reduce((acc, donation) => {
          if (!donation.collector_id) return acc;
          acc[donation.collector_id] = (acc[donation.collector_id] || 0) + (donation.amount || 0);
          return acc;
        }, {});
        return Object.entries(grouped)
            .map(([collector_id, total_amount]) => ({ collector_id, total_amount }))
            .sort((a, b) => b.total_amount - a.total_amount)
            .slice(0, 5);
      };
      const topDay = computeTop(dayData.data || []);
      const topWeek = computeTop(weekData.data || []);
      const allTopIds = [...new Set([...topDay, ...topWeek].map(t => parseInt(t.collector_id)))];

      const { data: collectorsData = [] } = await supabase.from('collectors').select('id, user_id').in('id', allTopIds);
      const userIds = collectorsData.map(c => c.user_id);
      const { data: usersData = [] } = await supabase.from('users').select('id, full_name, profile_image').in('id', userIds);

      const mergeData = (topArray) => topArray.map(top => {
        const collector = collectorsData.find(c => c.id === parseInt(top.collector_id));
        const userInfo = usersData.find(u => u.id === collector?.user_id);
        return {
          collector_id: top.collector_id,
          full_name: userInfo?.full_name || 'Inconnu',
          profile_image: userInfo?.profile_image?.trim() || 'https://via.placeholder.com/150',
          total_amount: top.total_amount,
        };
      });

      setTopDayAgents(mergeData(topDay));
      setTopWeekAgents(mergeData(topWeek));

      const { data: transactions = [] } = await supabase
          .from('donations')
          .select('*')
          .eq('collector_id', collector?.id)
          .order('created_at', { ascending: false })
          .limit(50);

      setRecentTransactions(transactions);
      const total = transactions.reduce((acc, d) => acc + (d.amount || 0), 0);
      setTotalDonations(total);
    } catch (err) {
      console.error('Erreur chargement dashboard:', err);
    }
  }
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigation.reset({
      index: 0,
      routes: [{ name: 'AuthNavigator' }],
    });
  };
  return (
      <SafeAreaView style={styles.container}>
        <View style={styles.floatingHeader}>
          <View style={styles.headerContent}>
            <TouchableOpacity onPress={() => setShowProfileOptions(true)}>
              <Image source={{ uri: userProfileImage }} style={styles.avatar} />
            </TouchableOpacity>

            <View>
              <Text style={styles.welcome}>Bienvenue</Text>
              <Text style={styles.userName}>{userName}</Text>
            </View>
            <Image source={require('../../assets/logo_whte.png')} style={styles.logoAzirm} />
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.grid}>
            <View style={styles.boxDark}>
              <Text style={styles.boxTitle}>Top 5 du jour</Text>
              {topDayAgents.map((a, i) => (
                  <View key={i} style={styles.agentRow}>
                    <Image source={{ uri: a.profile_image }} style={styles.agentAvatar} />
                    <Text style={styles.agentName}>{a.full_name}</Text>
                  </View>
              ))}
            </View>

            <View style={styles.boxDark}>
              <Text style={styles.boxTitle}>Top 5 semaine</Text>
              {topWeekAgents.map((a, i) => (
                  <View key={`week-${i}`} style={styles.agentRow}>
                    <Image source={{ uri: a.profile_image }} style={[styles.agentAvatar, i === 0 && styles.trophyBorder]} />
                    <Text style={styles.agentName}>{a.full_name} {i === 0 ? '🏆' : ''}</Text>
                  </View>
              ))}
            </View>

            <View style={styles.boxDarkFull}>
              <Text style={styles.boxTitle}>Statistiques jour</Text>
              <Text style={styles.boxBullet}>- Total donations : ${totalDonations}</Text>
              <Text style={styles.boxBullet}>- Heure sur le terrain : {realTimeHMS}</Text>
              <Text style={styles.boxBullet}>- Moyenne : ${(totalDonations / (recentTransactions.length || 1)).toFixed(2)}</Text>
            </View>

            <View style={styles.announcement}>
              <Text style={styles.announcementText}>Annonce</Text>
            </View>
          </View>
        </ScrollView>

        <View style={styles.bottomNav}>
          {['Dashboard', 'wallet', 'route', 'stats', 'training'].map((screen, i) => (
              <TouchableOpacity key={i} onPress={() => navigation.navigate(screen)} style={styles.navItem}>
                <Ionicons
                    name={
                      screen === 'Dashboard' ? 'home' :
                          screen === 'wallet' ? 'wallet' :
                              screen === 'route' ? 'map' :
                                  screen === 'stats' ? 'bar-chart' : 'book'
                    }
                    size={24}
                    color={screen === 'Dashboard' ? '#8B5CF6' : '#FFFFFF'}
                />
                <Text style={[styles.navText, screen === 'Dashboard' && { color: '#8B5CF6' }]}>
                  {screen === 'Dashboard' ? 'Accueil' : screen.charAt(0).toUpperCase() + screen.slice(1)}
                </Text>
              </TouchableOpacity>

          ))}
        </View>
        <Modal
            transparent
            visible={showProfileOptions}
            animationType="fade"
            onRequestClose={() => setShowProfileOptions(false)}
        >
          <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowProfileOptions(false)}>
            <View style={styles.modalBox}>
              <TouchableOpacity
                  style={styles.modalOption}
                  onPress={() => {
                    setShowProfileOptions(false);
                    navigation.navigate('profile');
                  }}
              >
                <Text style={styles.modalText}>✏️ Modifier mon compte</Text>
              </TouchableOpacity>
              <TouchableOpacity
                  style={styles.modalOption}
                  onPress={() => {
                    setShowProfileOptions(false);
                    handleLogout();
                  }}
              >
                <Text style={[styles.modalText, { color: '#FF5E5E' }]}>🔓 Se déconnecter</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

      </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  floatingHeader: {
    position: 'absolute',
    top: 20,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(28,28,30,0.95)',
    borderRadius: 25,
    paddingVertical: 14,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 12,
    zIndex: 10,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatar: { width: 55, height: 55, borderRadius: 27.5, borderWidth: 2, borderColor: '#fff' },
  welcome: { color: '#DDD', fontSize: 14 },
  userName: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  logoAzirm: { width: 60, height: 60, resizeMode: 'contain' },
  content: { padding: 10, paddingTop: 120 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  boxDark: {
    width: '48%',
    backgroundColor: '#1C1C1E',
    padding: 15,
    marginBottom: 15,
    borderRadius: 12,
  },
  boxDarkFull: {
    width: '100%',
    backgroundColor: '#1C1C1E',
    padding: 15,
    marginBottom: 15,
    borderRadius: 12,
  },
  boxTitle: { fontWeight: 'bold', fontSize: 16, marginBottom: 8, color: '#FFF' },
  boxBullet: { fontSize: 12, marginVertical: 2, color: '#AAA' },
  agentRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  agentAvatar: { width: 30, height: 30, borderRadius: 15, marginRight: 8 },
  agentName: { fontSize: 13, color: '#FFF' },
  trophyBorder: { borderWidth: 2, borderColor: 'gold' },
  announcement: {
    width: '100%',
    backgroundColor: '#1C1C1E',
    padding: 30,
    marginTop: 10,
    marginBottom: 20,
    borderRadius: 18,
    alignItems: 'center',
    borderColor: '#8B5CF6',
    borderWidth: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBox: {
    backgroundColor: '#1C1C1E',
    padding: 20,
    borderRadius: 12,
    width: '80%',
  },
  modalOption: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modalText: {
    color: '#FFF',
    fontSize: 16,
    textAlign: 'center',
  },

  announcementText: { fontSize: 22, fontWeight: 'bold', color: '#FFF' },
  bottomNav: {
    position: 'absolute',
    bottom: 20,
    left: 10,
    right: 10,
    flexDirection: 'row',
    backgroundColor: '#1C1C1E',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  navItem: { flex: 1, alignItems: 'center' },
  navText: { fontSize: 11, color: '#FFF', marginTop: 5 },
});
