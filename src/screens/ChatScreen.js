import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TextInput,
    Pressable,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    Image,
    Alert,
    Dimensions,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';

const { width, height } = Dimensions.get('window');

export default function ChatWithUsersScreen({ navigation }) {
    const { user } = useAuth();

    // State for users list + search input
    const [users, setUsers] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loadingUsers, setLoadingUsers] = useState(true);

    // Selected chat user
    const [selectedUser, setSelectedUser] = useState(null);

    // Chat messages state
    const [messages, setMessages] = useState([]);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);
    const flatListRef = useRef(null);

    // Fetch users from supabase (exclude current user)
    const loadUsers = async () => {
        setLoadingUsers(true);
        try {
            const { data, error } = await supabase
                .from('users')
                .select('id, nom_complet, photo')
                .neq('id', user.id)
                .ilike('nom_complet', `%${searchQuery}%`)
                .order('nom_complet', { ascending: true });
            if (error) throw error;
            setUsers(data);
        } catch (error) {
            console.error('Erreur chargement users:', error);
            Alert.alert('Erreur', 'Impossible de charger la liste des utilisateurs');
        } finally {
            setLoadingUsers(false);
        }
    };

    // Fetch messages for selectedUser
    const loadMessages = async (receiverId) => {
        if (!receiverId) return;
        setLoadingMessages(true);
        try {
            const { data, error } = await supabase
                .from('conversation')
                .select('*')
                .or(`and(emetteur.eq.${user.id},receveur.eq.${receiverId}),and(emetteur.eq.${receiverId},receveur.eq.${user.id})`)
                .order('created_at', { ascending: true });

            if (error) throw error;
            setMessages(data || []);
        } catch (error) {
            console.error('Erreur chargement messages:', error);
            Alert.alert('Erreur', 'Impossible de charger les messages');
        } finally {
            setLoadingMessages(false);
            setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
        }
    };

    // Search users on query change (debounce could be added)
    useEffect(() => {
        loadUsers();
    }, [searchQuery]);

    // Reload messages when selectedUser changes
    useEffect(() => {
        if (selectedUser) {
            loadMessages(selectedUser.id);
        } else {
            setMessages([]);
        }
    }, [selectedUser]);

    // Listen for new messages realtime for the current conversation
    useEffect(() => {
        if (!selectedUser) return;

        const channel = supabase
            .channel('conversation_channel')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'conversation',
                    filter: `or(and(emetteur.eq.${user.id},receveur.eq.${selectedUser.id}),and(emetteur.eq.${selectedUser.id},receveur.eq.${user.id}))`,
                },
                (payload) => {
                    setMessages((prev) => [...prev, payload.new]);
                    setTimeout(() => {
                        flatListRef.current?.scrollToEnd({ animated: true });
                    }, 100);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [selectedUser, user.id]);

    // Send message
    const sendMessage = async () => {
        if (!newMessage.trim() || sending || !selectedUser) return;

        setSending(true);
        const messageText = newMessage.trim();
        setNewMessage('');

        try {
            const { error } = await supabase.from('conversation').insert([
                {
                    emetteur: user.id,
                    receveur: selectedUser.id,
                    message: messageText,
                    created_at: new Date().toISOString(),
                },
            ]);

            if (error) throw error;
        } catch (error) {
            console.error('Erreur envoi message:', error);
            Alert.alert('Erreur', 'Impossible d\'envoyer le message');
            setNewMessage(messageText);
        } finally {
            setSending(false);
        }
    };

    // Format time (HH:mm)
    const formatTime = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    // Group messages by date with date separators
    const groupedMessages = useMemo(() => {
        const groups = [];
        let currentDate = '';

        messages.forEach((message) => {
            const messageDate = new Date(message.created_at).toDateString();

            if (messageDate !== currentDate) {
                currentDate = messageDate;
                groups.push({
                    type: 'date',
                    date: message.created_at,
                    id: `date-${messageDate}`,
                });
            }

            groups.push({
                type: 'message',
                ...message,
            });
        });

        return groups;
    }, [messages]);

    const renderUserItem = ({ item }) => {
        const isSelected = selectedUser?.id === item.id;
        return (
            <Pressable
                style={[styles.userItem, isSelected && styles.userItemSelected]}
                onPress={() => setSelectedUser(item)}
            >
                <Image
                    source={item.photo ? { uri: item.photo } : require('./img.png')}
                    style={styles.userAvatar}
                />
                <Text style={styles.usernameText} numberOfLines={1}>
                    {item.nom_complet}
                </Text>
            </Pressable>
        );
    };
    const renderMessageItem = ({ item }) => {
        if (item.type === 'date') {
            const dateObj = new Date(item.date);
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            let dateText = '';
            if (dateObj.toDateString() === today.toDateString()) {
                dateText = "Aujourd'hui";
            } else if (dateObj.toDateString() === yesterday.toDateString()) {
                dateText = 'Hier';
            } else {
                dateText = dateObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
            }

            return (
                <View style={styles.dateContainer}>
                    <Text style={styles.dateText}>{dateText}</Text>
                </View>
            );
        }

        const isMyMessage = item.emetteur === user.id;

        return (
            <View
                style={[
                    styles.messageContainer,
                    isMyMessage ? styles.myMessageContainer : styles.otherMessageContainer,
                ]}
            >
                <View
                    style={[
                        styles.messageBubble,
                        isMyMessage ? styles.myMessageBubble : styles.otherMessageBubble,
                    ]}
                >
                    <Text
                        style={[
                            styles.messageText,
                            isMyMessage ? styles.myMessageText : styles.otherMessageText,
                        ]}
                    >
                        {item.message}
                    </Text>
                    <Text
                        style={[
                            styles.timeText,
                            isMyMessage ? styles.myTimeText : styles.otherTimeText,
                        ]}
                    >
                        {formatTime(item.created_at)}
                    </Text>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.splitContainer}>
                {/* Left side: Users list + search */}
                <View style={styles.usersContainer}>
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Rechercher un utilisateur..."
                        placeholderTextColor="#999"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    {loadingUsers ? (
                        <ActivityIndicator style={{ marginTop: 20 }} size="large" color="#007AFF" />
                    ) : (
                        <FlatList
                            data={users}
                            keyExtractor={(item) => item.id}
                            renderItem={renderUserItem}
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={{ paddingVertical: 10 }}
                        />
                    )}
                </View>

                {/* Right side: Chat conversation */}
                <View style={styles.chatContainer}>
                    {!selectedUser ? (
                        <View style={styles.noChatSelected}>
                            <Text style={styles.noChatText}>Sélectionnez un utilisateur pour discuter</Text>
                        </View>
                    ) : (
                        <>
                            {/* Header */}
                            <View style={styles.chatHeader}>
                                <Pressable onPress={() => setSelectedUser(null)} style={styles.backToUsersButton}>
                                    <MaterialIcons name="arrow-back" size={24} color="#007AFF" />
                                </Pressable>
                                <View style={styles.chatHeaderUserInfo}>
                                    <Image
                                        source={
                                            selectedUser.photo
                                                ? { uri: selectedUser.photo }
                                                : require('./img.png')
                                        }
                                        style={styles.chatUserAvatar}
                                    />
                                    <Text style={styles.chatUsername}>{selectedUser.nom_complet}</Text>

                                    <Text style={styles.chatUsername}>{selectedUser.username}</Text>
                                </View>
                                <View style={{ width: 40 }} /> {/* Placeholder for right icons */}
                            </View>

                            {/* Messages list */}
                            {loadingMessages ? (
                                <ActivityIndicator style={{ flex: 1 }} size="large" color="#007AFF" />
                            ) : (
                                <FlatList
                                    ref={flatListRef}
                                    data={groupedMessages}
                                    renderItem={renderMessageItem}
                                    keyExtractor={(item) => (item.type === 'date' ? item.id : item.id?.toString())}
                                    style={styles.messagesList}
                                    showsVerticalScrollIndicator={false}
                                    onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                                />
                            )}

                            {/* Input */}
                            <KeyboardAvoidingView
                                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
                            >
                                <View style={styles.inputContainer}>
                                    <TextInput
                                        style={styles.textInput}
                                        value={newMessage}
                                        onChangeText={setNewMessage}
                                        placeholder="Tapez votre message..."
                                        placeholderTextColor="#999"
                                        multiline
                                        maxLength={1000}
                                    />
                                    <Pressable
                                        style={[styles.sendButton, (!newMessage.trim() || sending) && styles.sendButtonDisabled]}
                                        onPress={sendMessage}
                                        disabled={!newMessage.trim() || sending}
                                    >
                                        {sending ? (
                                            <ActivityIndicator size="small" color="#fff" />
                                        ) : (
                                            <MaterialIcons name="send" size={24} color="#fff" />
                                        )}
                                    </Pressable>
                                </View>
                            </KeyboardAvoidingView>
                        </>
                    )}
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f9fa',
    },
    splitContainer: {
        flex: 1,
        flexDirection: width > 600 ? 'row' : 'column', // row for tablets, column for phones
    },

    /* Left panel */
    usersContainer: {
        width: width > 600 ? 280 : '100%',
        borderRightWidth: width > 600 ? 1 : 0,
        borderRightColor: '#e1e8ed',
        backgroundColor: '#fff',
        paddingHorizontal: 12,
        paddingTop: 12,
    },
    searchInput: {
        height: 40,
        borderColor: '#e1e8ed',
        borderWidth: 1,
        borderRadius: 20,
        paddingHorizontal: 16,
        marginBottom: 10,
        backgroundColor: '#f8f9fa',
    },
    userItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 6,
        borderRadius: 12,
    },
    userItemSelected: {
        backgroundColor: '#007AFF22',
    },
    userAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        marginRight: 12,
        backgroundColor: '#ddd',
    },
    usernameText: {
        fontSize: 16,
        color: '#333',
        flexShrink: 1,
    },

    /* Right panel */
    chatContainer: {
        flex: 1,
        backgroundColor: '#f8f9fa',
        justifyContent: 'flex-start',
    },
    noChatSelected: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    noChatText: {
        fontSize: 16,
        color: '#666',
    },
    chatHeader: {
        height: 56,
        backgroundColor: '#fff',
        borderBottomColor: '#e1e8ed',
        borderBottomWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        justifyContent: 'space-between',
    },
    backToUsersButton: {
        padding: 8,
    },
    chatHeaderUserInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginLeft: 8,
    },
    chatUserAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#ddd',
        marginRight: 12,
    },
    chatUsername: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
        flexShrink: 1,
    },
    messagesList: {
        flex: 1,
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    dateContainer: {
        alignItems: 'center',
        marginVertical: 20,
    },
    dateText: {
        fontSize: 14,
        color: '#666',
        backgroundColor: '#e9ecef',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    messageContainer: {
        marginVertical: 2,
    },
    myMessageContainer: {
        alignItems: 'flex-end',
    },
    otherMessageContainer: {
        alignItems: 'flex-start',
    },
    messageBubble: {
        maxWidth: '75%',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
    },
    myMessageBubble: {
        backgroundColor: '#007AFF',
        borderBottomRightRadius: 6,
    },
    otherMessageBubble: {
        backgroundColor: '#e9ecef',
        borderBottomLeftRadius: 6,
    },
    messageText: {
        fontSize: 16,
        lineHeight: 20,
    },
    myMessageText: {
        color: '#fff',
    },
    otherMessageText: {
        color: '#333',
    },
    timeText: {
        fontSize: 12,
        marginTop: 4,
        opacity: 0.7,
    },
    myTimeText: {
        color: '#fff',
        textAlign: 'right',
    },
    otherTimeText: {
        color: '#666',
        textAlign: 'left',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#e1e8ed',
    },
    textInput: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#e1e8ed',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 10,
        fontSize: 16,
        maxHeight: 100,
        backgroundColor: '#f8f9fa',
        marginRight: 10,
    },
    sendButton: {
        backgroundColor: '#007AFF',
        borderRadius: 20,
        padding: 10,
        justifyContent: 'center',
        alignItems: 'center',
        minWidth: 40,
        minHeight: 40,
    },
    sendButtonDisabled: {
        backgroundColor: '#ccc',
    },
});
