import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Dimensions, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, FontAwesome, MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';

const { width } = Dimensions.get('window');

export default function DashboardScreen() {
  const { user, userName, logout } = useAuth();
  const navigation = useNavigation();
  const [collectorId, setCollectorId] = useState(null);
  const [totalDonations, setTotalDonations] = useState(0);
  const [hoursServed, setHoursServed] = useState(0);
  const [realTimeHours, setRealTimeHours] = useState(0);
  const [realTimeHMS, setRealTimeHMS] = useState('0h 0m 0s');
  const [topAgents, setTopAgents] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [userProfileImage, setUserProfileImage] = useState('https://via.placeholder.com/150');
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setModalVisible] = useState(false);
  const timerRef = useRef(null);
  const loginStartTimeRef = useRef(Date.now());

  useEffect(() => {
    if (user?.id) fetchDashboardData();
  }, [user]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      const now = Date.now();
      const diffMs = now - loginStartTimeRef.current;
      const diffHours = diffMs / (1000 * 60 * 60);
      const updatedHours = hoursServed + diffHours;
      setRealTimeHours(updatedHours);
      setRealTimeHMS(formatDecimalHoursToHMS(updatedHours));
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [hoursServed]);

  function formatDecimalHoursToHMS(decimalHours) {
    if (!decimalHours || isNaN(decimalHours)) return '0h 0m 0s';
    const totalSeconds = Math.floor(decimalHours * 3600);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${hours}h ${minutes}m ${seconds}s`;
  }

  async function fetchDashboardData() {
    setLoading(true);
    try {
      const [userRes] = await Promise.all([
        supabase.from('users').select('profile_image').eq('id', user?.id).single(),
      ]);

      if (userRes.error) throw userRes.error;
      setUserProfileImage(userRes.data?.profile_image?.trim() || 'https://via.placeholder.com/150');

      const { data: collector, error: collectorError } = await supabase
          .from('collectors')
          .select('id, hours_served')
          .eq('user_id', user.id)
          .single();

      if (collectorError) throw collectorError;

      setCollectorId(collector.id);
      setHoursServed(Number(collector.hours_served || 0));

      const [
        { data: donationsData },
        { data: recentData },
        { data: rawDonations },
      ] = await Promise.all([
        supabase.from('donations').select('amount').eq('collector_id', collector.id),
        supabase.from('donations')
            .select('*')
            .eq('collector_id', collector.id)
            .order('created_at', { ascending: false })
            .limit(50),
        supabase.from('donations').select('collector_id, amount'),
      ]);

      const total = (donationsData ?? []).reduce((acc, curr) => acc + (curr.amount || 0), 0);
      setTotalDonations(total);
      setRecentTransactions(recentData || []);

      const grouped = rawDonations.reduce((acc, donation) => {
        if (!donation.collector_id) return acc;
        acc[donation.collector_id] = (acc[donation.collector_id] || 0) + (donation.amount || 0);
        return acc;
      }, {});

      const topArray = Object.entries(grouped)
          .map(([collector_id, total_amount]) => ({ collector_id, total_amount }))
          .sort((a, b) => b.total_amount - a.total_amount)
          .slice(0, 5);

      const topCollectorIds = topArray.map(t => parseInt(t.collector_id)).filter(Boolean);

      const { data: collectorsData = [] } = await supabase
          .from('collectors')
          .select('id, user_id')
          .in('id', topCollectorIds);

      const userIds = collectorsData.map(c => c.user_id).filter(Boolean);

      const { data: usersData = [] } = await supabase
          .from('users')
          .select('id, full_name, profile_image')
          .in('id', userIds);

      const mergedTopAgents = topArray.map(top => {
        const collector = collectorsData.find(c => c.id === parseInt(top.collector_id));
        const userInfo = usersData.find(u => u.id === collector?.user_id);
        return {
          collector_id: top.collector_id,
          full_name: userInfo?.full_name || 'Inconnu',
          profile_image: userInfo?.profile_image?.trim() || 'https://via.placeholder.com/150',
          total_amount: top.total_amount,
        };
      });

      setTopAgents(mergedTopAgents);
    } catch (err) {
      console.error('❌ Erreur de chargement complet:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
      <SafeAreaView style={styles.container}>
        <ScrollView>
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <TouchableOpacity onPress={() => navigation.navigate('wallet')}>
                <Image source={{ uri: userProfileImage || 'https://via.placeholder.com/150' }} style={styles.avatar} />
              </TouchableOpacity>
              <View style={styles.userTexts}>
                <Text style={styles.welcomeText}>Bienvenue,</Text>
                <Text style={styles.userName}>{userName}</Text>
              </View>
              <Image source={require('../../assets/logo_whte.png')} style={styles.logoAzirm} />
            </View>
          </View>

          <View style={styles.statsContainer}>
            {renderStatCard('heart', 'Total Donations', `$${totalDonations.toLocaleString()}`)}
            {renderStatCard('time-outline', 'Hours Served', realTimeHMS)}
            {renderStatCard('people-outline', 'Top Collectors', topAgents.length)}
          </View>

          <Text style={styles.sectionTitle}>Top 5 Collectors</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.top5Scroll}>
            {topAgents.map((agent, index) => (
                <View key={agent.collector_id} style={styles.top5Card}>
                  <Image source={{ uri: agent.profile_image || 'https://via.placeholder.com/150' }} style={styles.top5Image} />
                  <Text style={styles.top5Rank}>#{index + 1}</Text>
                  <Text style={styles.top5Name}>{agent.full_name}</Text>
                  <Text style={styles.top5AmountValue}>${agent.total_amount}</Text>
                </View>
            ))}
          </ScrollView>

          <Text style={styles.sectionTitle}>Dernières transactions</Text>
          {recentTransactions.map((tx, idx) => (
              <View key={idx} style={styles.activityItem}>
                <View>
                  <Text style={{ fontWeight: 'bold' }}>{tx.amount} $</Text>
                  <Text style={{ color: '#666', fontSize: 12 }}>{tx.payment_method || 'Méthode inconnue'}</Text>
                </View>
                <Text style={{ color: '#666' }}>{new Date(tx.created_at).toLocaleString()}</Text>
              </View>
          ))}
        </ScrollView>

        <View style={styles.bottomNav}>
          {renderNavItem('home', 'Accueil', true, () => navigation.navigate('Dashboard'))}
          {renderNavItem('account-balance-wallet', 'Wallet', false, () => navigation.navigate('wallet'))}
          {renderNavItem('place', 'Missions', false, () => navigation.navigate('route'))}
          {renderNavItem('bar-chart', 'Stats', false, () => navigation.navigate('stats'))}
          {renderNavItem('menu-book', 'Formation', false, () => navigation.navigate('training'))}
        </View>
      </SafeAreaView>
  );

  function renderStatCard(iconName, label, value) {
    return (
        <View style={styles.statCard}>
          <Ionicons name={iconName} size={30} color="#8B5CF6" />
          <Text style={styles.statLabel}>{label}</Text>
          <Text style={styles.statValue}>{value}</Text>
        </View>
    );
  }

  function renderNavItem(iconName, label, isActive, onPress) {
    return (
        <TouchableOpacity style={styles.navItem} onPress={onPress}>
          <MaterialIcons name={iconName} size={24} color={isActive ? '#8B5CF6' : '#9CA3AF'} />
          <Text style={[styles.navText, isActive && styles.activeNavText]}>{label}</Text>
        </TouchableOpacity>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  statsContainer: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 20 },
  statCard: { alignItems: 'center', backgroundColor: '#fff', padding: 20, borderRadius: 20, width: width * 0.28, elevation: 5 },
  statLabel: { color: '#777', marginVertical: 8 },
  statValue: { fontWeight: 'bold', fontSize: 20, color: '#4B3F72' },
  header: { paddingVertical: 20, backgroundColor: '#7078DC', borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  headerContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  avatar: { width: 65, height: 65, borderRadius: 32.5, borderWidth: 3, borderColor: '#fff' },
  userTexts: { marginLeft: 15 },
  welcomeText: { color: '#D1C4E9', fontSize: 15 },
  userName: { fontWeight: 'bold', fontSize: 24, color: '#FFF' },
  logoAzirm: { width: 120, height: 120, resizeMode: 'contain' },
  sectionTitle: { fontWeight: 'bold', fontSize: 20, marginLeft: 20, marginTop: 20, color: '#333' },
  top5Scroll: { paddingLeft: 20, marginVertical: 10 },
  top5Card: { backgroundColor: '#fff', padding: 20, borderRadius: 20, marginRight: 15, alignItems: 'center', width: 150, elevation: 6 },
  top5Image: { width: 65, height: 65, borderRadius: 32.5 },
  top5Rank: { position: 'absolute', top: 5, right: 10, backgroundColor: '#6A4FB0', color: '#fff', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, fontSize: 12 },
  top5Name: { marginTop: 10, fontWeight: '600', color: '#333' },
  top5AmountValue: { fontWeight: 'bold', fontSize: 18, color: '#10B981' },
  activityItem: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', padding: 15, margin: 10, borderRadius: 15, elevation: 3 },
  bottomNav: { position: 'absolute', bottom: 20, left: 10, right: 10, flexDirection: 'row', backgroundColor: '#FFFFFF', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 30, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 10 },
  navItem: { flex: 1, alignItems: 'center' },
  navText: { fontSize: 11, color: '#666', marginTop: 5 },
  activeNavText: { color: '#7078DC' },
});
