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

const { width } = Dimensions.get('window');

export default function ChatWithUsersScreen({ navigation }) {
    const { user } = useAuth();

    // Mode : "history" (conversations) or "new" (search users to start chat)
    const [mode, setMode] = useState('history');

    // States
    const [searchQuery, setSearchQuery] = useState('');
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [loadingConversations, setLoadingConversations] = useState(true);
    const [users, setUsers] = useState([]);
    const [conversations, setConversations] = useState([]);

    // Chat
    const [selectedUser, setSelectedUser] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);

    const flatListRef = useRef(null);

    // --- Chargement liste utilisateurs pour mode "new" ---
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
            setUsers(data || []);
        } catch (error) {
            console.error('Erreur chargement users:', error);
            Alert.alert('Erreur', 'Impossible de charger la liste des utilisateurs');
        } finally {
            setLoadingUsers(false);
        }
    };

    // --- Chargement historique des conversations (dernier message par utilisateur) ---
    const loadConversations = async () => {
        setLoadingConversations(true);
        try {
            const { data, error } = await supabase
                .from('conversation')
                .select('*')
                .or(`emetteur.eq.${user.id},receveur.eq.${user.id}`)
                .order('created_at', { ascending: false });

            if (error) throw error;

            const messages = data || [];

            // Map userId => last message with that user
            const convMap = new Map();

            messages.forEach((msg) => {
                // Identifier l'autre utilisateur dans la conversation
                const otherUserId = msg.emetteur === user.id ? msg.receveur : msg.emetteur;

                // Si pas encore enregistré ou message plus récent
                if (
                    !convMap.has(otherUserId) ||
                    new Date(msg.created_at) > new Date(convMap.get(otherUserId).created_at)
                ) {
                    convMap.set(otherUserId, msg);
                }
            });

            // On récupère la liste des autres users pour afficher nom/photo
            const otherUserIds = Array.from(convMap.keys());
            if (otherUserIds.length === 0) {
                setConversations([]);
                setLoadingConversations(false);
                return;
            }

            const { data: usersData, error: usersError } = await supabase
                .from('users')
                .select('id, nom_complet, photo')
                .in('id', otherUserIds);

            if (usersError) throw usersError;

            // Construire tableau conversations
            const convList = otherUserIds.map((id) => {
                const lastMessage = convMap.get(id);
                const userInfo = usersData.find((u) => u.id === id);

                return {
                    user: userInfo,
                    lastMessage,
                };
            });

            // Trier par date dernier message descendant
            convList.sort(
                (a, b) =>
                    new Date(b.lastMessage.created_at).getTime() -
                    new Date(a.lastMessage.created_at).getTime()
            );

            setConversations(convList);
        } catch (error) {
            console.error('Erreur chargement conversations:', error);
            Alert.alert('Erreur', 'Impossible de charger les conversations');
        } finally {
            setLoadingConversations(false);
        }
    };

    // --- Chargement messages d'une conversation ---
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

    // --- Envoi message ---
    const sendMessage = async () => {
        if (!newMessage.trim() || sending || !selectedUser) return;

        setSending(true);
        const messageText = newMessage.trim();
        setNewMessage('');

        try {
            const { data, error } = await supabase.from('conversation').insert([
                {
                    emetteur: user.id,
                    receveur: selectedUser.id,
                    message: messageText,
                    created_at: new Date().toISOString(),
                },
            ]).select();

            if (error) throw error;

            // Add the new message to the state immediately for a responsive UI
            if (data && data.length > 0) {
                setMessages(prev => [...prev, data[0]]);
                setTimeout(() => {
                    flatListRef.current?.scrollToEnd({ animated: true });
                }, 100);
            }
        } catch (error) {
            console.error('Erreur envoi message:', error);
            Alert.alert('Erreur', 'Impossible d\'envoyer le message');
            setNewMessage(messageText);
        } finally {
            setSending(false);
        }
    };

    // --- Format time (HH:mm) ---
    const formatTime = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    // --- Group messages par date pour affichage ---
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

    // --- Effets ---
    useEffect(() => {
        if (mode === 'new') {
            loadUsers();
        } else {
            loadConversations();
        }
    }, [mode, searchQuery]);

    useEffect(() => {
        if (selectedUser) {
            loadMessages(selectedUser.id);
        } else {
            setMessages([]);
        }
    }, [selectedUser]);

    // Realtime messages pour la conversation courante
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
                    filter: `(emetteur=eq.${user.id} AND receveur=eq.${selectedUser.id}) OR (emetteur=eq.${selectedUser.id} AND receveur=eq.${user.id})`
                },
                (payload) => {
                    // Check if the message is not already in the state
                    if (!messages.some(msg => msg.id === payload.new.id)) {
                        setMessages((prev) => [...prev, payload.new]);
                        setTimeout(() => {
                            flatListRef.current?.scrollToEnd({ animated: true });
                        }, 100);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [selectedUser, user.id, messages]);

    // --- Renders ---

    // Item pour liste utilisateurs (mode "new")
    const renderUserItem = ({ item }) => {
        const isSelected = selectedUser?.id === item.id;
        return (
            <Pressable
                style={[styles.userItem, isSelected && styles.userItemSelected]}
                onPress={() => {
                    setSelectedUser(item);
                    setMode('history'); // Switch to conversation view on selection
                    setSearchQuery('');
                }}
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

    // Item pour liste conversations (mode "history")
    const renderConversationItem = ({ item }) => {
        const otherUser = item.user;
        const lastMsg = item.lastMessage;
        const isSelected = selectedUser?.id === otherUser.id;

        if (!otherUser) return null;

        return (
            <Pressable
                style={[styles.userItem, isSelected && styles.userItemSelected]}
                onPress={() => setSelectedUser(otherUser)}
            >
                <Image
                    source={otherUser.photo ? { uri: otherUser.photo } : require('./img.png')}
                    style={styles.userAvatar}
                />
                <View style={{ flex: 1 }}>
                    <Text style={styles.usernameText} numberOfLines={1}>
                        {otherUser.nom_complet}
                    </Text>
                    <Text
                        style={styles.lastMessageText}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                    >
                        {lastMsg.emetteur === user.id ? 'Vous: ' : ''}
                        {lastMsg.message}
                    </Text>
                </View>
                <Text style={styles.lastMessageTime}>
                    {formatTime(lastMsg.created_at)}
                </Text>
            </Pressable>
        );
    };

    // Item pour messages dans la conversation
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
                {/* Left side: Conversations or User search */}
                <View style={styles.usersContainer}>
                    <View style={styles.newButtonContainer}>
                        <Pressable
                            style={styles.newButton}
                            onPress={() => {
                                setSelectedUser(null);
                                setMode('new');
                                setSearchQuery('');
                            }}
                        >
                            <MaterialIcons name="add" size={20} color="#007AFF" />
                            <Text style={styles.newButtonText}>Nouveau</Text>
                        </Pressable>
                    </View>

                    <TextInput
                        style={styles.searchInput}
                        placeholder={mode === 'new' ? "Rechercher un utilisateur..." : "Rechercher dans les conversations..."}
                        placeholderTextColor="#999"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />

                    {mode === 'new' ? (
                        loadingUsers ? (
                            <ActivityIndicator style={{ marginTop: 20 }} size="large" color="#007AFF" />
                        ) : (
                            <FlatList
                                data={users}
                                keyExtractor={(item) => item.id}
                                renderItem={renderUserItem}
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={{ paddingVertical: 10 }}
                            />
                        )
                    ) : (
                        loadingConversations ? (
                            <ActivityIndicator style={{ marginTop: 20 }} size="large" color="#007AFF" />
                        ) : (
                            <FlatList
                                data={conversations.filter((conv) =>
                                    conv.user.nom_complet.toLowerCase().includes(searchQuery.toLowerCase())
                                )}
                                keyExtractor={(item) => item.user.id}
                                renderItem={renderConversationItem}
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={{ paddingVertical: 10 }}
                            />
                        )
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
                                </View>
                                <View style={{ width: 40 }} /> {/* Placeholder */}
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
        backgroundColor: '#fff',
    },
    splitContainer: {
        flexDirection: 'row',
        flex: 1,
    },
    usersContainer: {
        width: width * 0.35,
        borderRightWidth: 1,
        borderRightColor: '#ddd',
        backgroundColor: '#f9f9f9',
        paddingHorizontal: 10,
        paddingTop: 10,
    },
    newButtonContainer: {
        marginBottom: 10,
        flexDirection: 'row',
        justifyContent: 'flex-start',
    },
    newButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#007AFF',
    },
    newButtonText: {
        color: '#007AFF',
        fontWeight: '600',
        marginLeft: 6,
    },
    searchInput: {
        height: 38,
        borderColor: '#ddd',
        borderWidth: 1,
        borderRadius: 20,
        paddingHorizontal: 15,
        backgroundColor: '#fff',
        marginBottom: 10,
        fontSize: 14,
    },
    userItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 6,
        borderRadius: 10,
        marginBottom: 4,
    },
    userItemSelected: {
        backgroundColor: '#e6f0ff',
    },
    userAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        marginRight: 10,
        backgroundColor: '#ccc',
    },
    usernameText: {
        fontWeight: '600',
        fontSize: 14,
        flexShrink: 1,
    },
    lastMessageText: {
        color: '#666',
        fontSize: 13,
        marginTop: 2,
    },
    lastMessageTime: {
        fontSize: 12,
        color: '#999',
        marginLeft: 5,
    },
    chatContainer: {
        flex: 1,
        backgroundColor: '#fff',
        justifyContent: 'flex-start',
    },
    noChatSelected: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 30,
    },
    noChatText: {
        fontSize: 16,
        color: '#999',
        textAlign: 'center',
    },
    chatHeader: {
        height: 60,
        borderBottomWidth: 1,
        borderBottomColor: '#ddd',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        backgroundColor: '#f5f5f5',
    },
    backToUsersButton: {
        width: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    chatHeaderUserInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginLeft: 5,
    },
    chatUserAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#ccc',
        marginRight: 10,
    },
    chatUsername: {
        fontWeight: '700',
        fontSize: 16,
    },
    messagesList: {
        flex: 1,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: '#fafafa',
    },
    dateContainer: {
        alignItems: 'center',
        marginVertical: 10,
    },
    dateText: {
        fontSize: 13,
        color: '#999',
        fontWeight: '600',
        backgroundColor: '#e0e0e0',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 12,
        overflow: 'hidden',
    },
    messageContainer: {
        marginVertical: 4,
        flexDirection: 'row',
        maxWidth: '75%',
    },
    myMessageContainer: {
        alignSelf: 'flex-end',
        justifyContent: 'flex-end',
    },
    otherMessageContainer: {
        alignSelf: 'flex-start',
        justifyContent: 'flex-start',
    },
    messageBubble: {
        borderRadius: 15,
        paddingHorizontal: 12,
        paddingVertical: 8,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 1 },
    },
    myMessageBubble: {
        backgroundColor: '#007AFF',
        borderTopRightRadius: 0,
    },
    otherMessageBubble: {
        backgroundColor: '#e5e5ea',
        borderTopLeftRadius: 0,
    },
    messageText: {
        fontSize: 14,
    },
    myMessageText: {
        color: '#fff',
    },
    otherMessageText: {
        color: '#000',
    },
    timeText: {
        fontSize: 10,
        marginTop: 4,
        textAlign: 'right',
    },
    myTimeText: {
        color: '#d0d0d0',
    },
    otherTimeText: {
        color: '#888',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderTopWidth: 1,
        borderTopColor: '#ddd',
        backgroundColor: '#fff',
    },
    textInput: {
        flex: 1,
        maxHeight: 100,
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 20,
        paddingHorizontal: 15,
        paddingVertical: 8,
        fontSize: 14,
        color: '#000',
    },
    sendButton: {
        marginLeft: 10,
        backgroundColor: '#007AFF',
        borderRadius: 20,
        padding: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sendButtonDisabled: {
        backgroundColor: '#a0c4ff',
    },
});
