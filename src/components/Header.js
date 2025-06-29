import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { FontAwesome5, MaterialIcons } from '@expo/vector-icons';
import { useConnectivity } from '../context/ConnectivityContext';
import { useAuth } from '../context/AuthContext';

export default function Header() {
  const { isOnline, pendingItems, syncData } = useConnectivity();
  const { user } = useAuth();
  const [isSyncing, setIsSyncing] = React.useState(false);

  const handleSync = async () => {
    if (isSyncing || !isOnline) return;

    setIsSyncing(true);
    await syncData();
    setIsSyncing(false);
  };

  const userInitials = user ?
    `${user.firstName?.charAt(0) || ''}${user.lastName?.charAt(0) || ''}` :
    "JD";

  return (
    <View style={styles.header}>
      <View style={styles.titleContainer}>
        <FontAwesome5 name="hand-holding-heart" size={18} color="#0059E4" style={styles.logo} />
        <Text style={styles.title}>AZIRM Collector</Text>
      </View>

      <View style={styles.actionsContainer}>
        <View style={[
          styles.statusBadge,
          isOnline ? styles.onlineBadge : styles.offlineBadge
        ]}>
          <View style={[
            styles.statusDot,
            isOnline ? styles.onlineDot : styles.offlineDot
          ]} />
          <Text style={[
            styles.statusText,
            isOnline ? styles.onlineText : styles.offlineText
          ]}>
            {isOnline ? 'Online' : 'Offline'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.iconButton}
          onPress={handleSync}
          disabled={isSyncing || !isOnline || pendingItems === 0}
        >
          <MaterialIcons
            name="sync"
            size={24}
            color={pendingItems > 0 ? "#0059E4" : "#CCCCCC"}
            style={isSyncing ? styles.spinning : undefined}
          />
        </TouchableOpacity>

        <TouchableOpacity style={styles.iconButton}>
          <MaterialIcons name="notifications" size={24} color="#0059E4" />
        </TouchableOpacity>

        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{userInitials}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    width: '70',
    height: '70',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  onlineBadge: {
    backgroundColor: 'rgba(52, 199, 89, 0.1)',
  },
  offlineBadge: {
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  onlineDot: {
    backgroundColor: '#34C759',
  },
  offlineDot: {
    backgroundColor: '#FF4539',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  onlineText: {
    color: '#34C759',
  },
  offlineText: {
    color: '#FF4539',
  },
  iconButton: {
    padding: 8,
    marginHorizontal: 2,
  },
  spinning: {
    transform: [{ rotate: '45deg' }],
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0059E4',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
