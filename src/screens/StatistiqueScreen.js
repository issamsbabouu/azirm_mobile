import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    SafeAreaView,
    View,
    Text,
    StyleSheet,
    ScrollView,
    Image,
    Animated,
    Easing,
    Alert,
    ActivityIndicator,
    TouchableOpacity,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Svg, Rect, Line, G, Text as SvgText } from "react-native-svg";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../supabase";
import DateTimePicker from '@react-native-community/datetimepicker';
const formatCurrency = (n, currency = "USD") => {
    // Conversion explicite en nombre avec vérification
    let num = Number(n);

    // Si la conversion échoue ou donne NaN, retourner 0
    if (!isFinite(num) || isNaN(num)) {
        num = 0;
    }

    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: 0,
        useGrouping: false
    }).format(num);
};
function startOfWeek(d = new Date()) {
    const date = new Date(d);
    const day = (date.getDay() + 6) % 7; // Lundi=0 ... Dimanche=6
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - day);
    return date;
}

function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
}

function endOfWeek(d) {
    return addDays(startOfWeek(d), 6);
}

function yyyymmdd(d) {
    const x = new Date(d);
    if (isNaN(x.getTime())) return null;

    const m = String(x.getMonth() + 1).padStart(2, "0");
    const day = String(x.getDate()).padStart(2, "0");
    return `${x.getFullYear()}-${m}-${day}`;
}

function formatDateToFrench(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

function AnimatedNumber({ value, formatter = (v) => v, duration = 800, style }) {
    const safeValue = Number(value) || 0;
    const animatedValue = useRef(new Animated.Value(safeValue)).current;
    const [displayValue, setDisplayValue] = useState(safeValue);

    useEffect(() => {
        Animated.timing(animatedValue, {
            toValue: safeValue,
            duration,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false,
        }).start();

        const listener = animatedValue.addListener(({ value }) => {
            if (isFinite(value)) {
                setDisplayValue(value);
            }
        });

        return () => animatedValue.removeAllListeners();
    }, [safeValue, animatedValue]);

    return <Text style={style}>{formatter(Math.round(displayValue))}</Text>;
}

function StatChip({
                      theme,
                      tone = "default",
                      icon,
                      label,
                      value,
                      formatter,
                      suffix = "",
                  }) {
    const tones = {
        default: { bg: theme.isDark ? "#17181B" : "#F6F7F9", text: theme.colors.textPrimary, dot: "#9CA3AF" },
        green: { bg: theme.isDark ? "#11261B" : "#EAFBF3", text: "#059669", dot: "#10B981" },
        red: { bg: theme.isDark ? "#2A1316" : "#FDECEE", text: "#DC2626", dot: "#EF4444" },
        blue: { bg: theme.isDark ? "#0F1E33" : "#EAF2FF", text: "#2563EB", dot: "#3B82F6" },
        amber: { bg: theme.isDark ? "#2A200F" : "#FFF7E8", text: "#B45309", dot: "#F59E0B" },
        muted: { bg: theme.isDark ? "#1E1F23" : "#F3F4F6", text: "#6B7280", dot: "#9CA3AF" },
    }[tone];

    return (
        <View
            style={[
                { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9999, backgroundColor: tones.bg, gap: 6 },
                styles.rowCenter,
            ]}
        >
            <View style={[styles.rowCenter, { gap: 6 }]}>
                <View style={[styles.dot, { backgroundColor: tones.dot }]} />
                <View>{icon}</View>
                {label ? <Text style={{ color: tones.text, fontWeight: "600" }}>{label}</Text> : null}
            </View>
            <View style={{ height: 16, width: 1, backgroundColor: theme.colors.border, marginHorizontal: 2 }} />
            <AnimatedNumber
                value={Number(value) || 0}
                formatter={formatter || ((v) => `${v}${suffix}`)}
                style={{ color: tones.text, fontWeight: "800" }}
            />
        </View>
    );
}

function WeeklyBarChart({
                            theme,
                            values = [],
                            width,
                            height = 160,
                            padding = 18,
                            labelFormatter = (v) => v,
                        }) {
    if (!width || width < 100 || !Array.isArray(values)) {
        return (
            <View style={{
                height,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.background,
                borderRadius: 8
            }}>
                <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>
                    Graphique non disponible
                </Text>
            </View>
        );
    }

    const safeValues = Array(7).fill(0).map((_, i) => {
        const val = Number(values[i] || 0);
        return isFinite(val) && val >= 0 ? val : 0;
    });

    const max = Math.max(1, Math.max(...safeValues));
    const barW = 20;
    const gap = 8;
    const labels = ["L", "M", "M", "J", "V", "S", "D"];

    const totalWidth = 7 * barW + 6 * gap;
    const availableWidth = width - 2 * padding;

    let actualBarW = barW;
    let actualGap = gap;

    if (totalWidth > availableWidth) {
        const ratio = availableWidth / totalWidth;
        actualBarW = Math.max(12, barW * ratio);
        actualGap = Math.max(4, gap * ratio);
    }

    const actualTotalWidth = 7 * actualBarW + 6 * actualGap;
    const startX = Math.max(padding, (width - actualTotalWidth) / 2);

    const barColor = theme.colors.accent === theme.colors.background ? "#3B82F6" : theme.colors.accent;

    return (
        <Svg width={width} height={height} style={{ backgroundColor: 'transparent' }}>
            <Line
                x1={padding}
                y1={height - padding}
                x2={width - padding}
                y2={height - padding}
                stroke={theme.colors.border || "#E5E7EB"}
                strokeWidth={1}
            />
            <Line
                x1={padding}
                y1={padding}
                x2={padding}
                y2={height - padding}
                stroke={theme.colors.border || "#E5E7EB"}
                strokeWidth={1}
            />

            <G>
                {safeValues.map((v, i) => {
                    const usableH = height - padding * 2;
                    const h = Math.max(0, Math.round((v / max) * usableH));
                    const x = Math.max(0, startX + i * (actualBarW + actualGap));
                    const y = Math.max(padding, height - padding - h);

                    if (!isFinite(x) || !isFinite(y) || !isFinite(h) || x < 0 || y < 0) {
                        return null;
                    }

                    return (
                        <G key={`bar-${i}`}>
                            <Rect
                                x={x}
                                y={y}
                                width={actualBarW}
                                height={h}
                                rx={Math.min(4, actualBarW / 4)}
                                fill={barColor}
                            />

                            <SvgText
                                x={x + actualBarW / 2}
                                y={height - padding + 14}
                                fontSize="10"
                                fill={theme.colors.textSecondary || "#6B7280"}
                                textAnchor="middle"
                                fontWeight="600"
                            >
                                {labels[i]}
                            </SvgText>

                            {h > 20 && v > 0 && (
                                <SvgText
                                    x={x + actualBarW / 2}
                                    y={y - 4}
                                    fontSize="9"
                                    fill={theme.colors.textSecondary || "#6B7280"}
                                    textAnchor="middle"
                                    fontWeight="500"
                                >
                                    {labelFormatter(Math.round(v))}
                                </SvgText>
                            )}
                        </G>
                    );
                })}
            </G>
        </Svg>
    );
}

export default function StatistiqueScreen() {
    const { theme, isDark, toggleTheme, cycleTheme } = useTheme();
    const { user, userName, userPosteLabel, logout } = useAuth();
    const s = createStyles(theme);
    const calculateDailyTotal = (data) => {
        if (!Array.isArray(data)) {
            return 0;
        }
        const total = data.reduce((acc, donation) => {
            const donationAmount = Number(donation.total_donation) || 0;
            return acc + donationAmount;
        }, 0);

        return total;
    };
    const [personalStats, setPersonalStats] = useState({
        jour: {
            dons: 0,
            portes: 0,
            acceptes: 0,
            refus: 0,
            absents: 0,
            temps: 0,
        },
        semaine: {
            dons: 0,
            portes: 0,
            acceptes: 0,
            refus: 0,
            absents: 0,
            temps: 0,
        }
    });

    const [chartW, setChartW] = useState(0);
    const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
    const [ajustements, setAjustements] = useState([]);
    const [loadingAj, setLoadingAj] = useState(false);
    const [errorAj, setErrorAj] = useState(null);
    const [dailyDonations, setDailyDonations] = useState([]);
    const [loadingDonations, setLoadingDonations] = useState(false);
    const [errorDonations, setErrorDonations] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [loadingTransactions, setLoadingTransactions] = useState(false);
    const [errorTransactions, setErrorTransactions] = useState(null);
    const [selectedDate, setSelectedDate] = useState(yyyymmdd(new Date()));
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [commissionHistory, setCommissionHistory] = useState([]);
    const [loadingCommission, setLoadingCommission] = useState(false);
    const [errorCommission, setErrorCommission] = useState(null);
    const [doorsWeekStart, setDoorsWeekStart] = useState(() => startOfWeek(new Date()));
    const [productionData, setProductionData] = useState([]);
    const [loadingProduction, setLoadingProduction] = useState(false);
    const [errorProduction, setErrorProduction] = useState(null);
    useEffect(() => {
        if (!user?.id) return;

        const fetchDailyStats = async () => {
            try {
                const today = yyyymmdd(new Date());

                const { data: donationsData, error: donationsError } = await supabase
                    .from("donations")
                    .select("*")
                    .eq("collector_id", user.id)
                    .gte("date", `${today}T00:00:00`)
                    .lte("date", `${today}T23:59:59`);

                if (donationsError) throw donationsError;

                const safeDonations = Array.isArray(donationsData) ? donationsData : [];

                // Calculer la somme des dons pour aujourd'hui
                const totalDonsJour = calculateDailyTotal(safeDonations);

                // Mettre à jour l'état avec les nouvelles valeurs
                setPersonalStats(prev => ({
                    ...prev,
                    jour: {
                        ...prev.jour,
                        dons: totalDonsJour,
                        // Ajoutez d'autres statistiques si nécessaire
                    }
                }));

            } catch (e) {
                console.log("[Daily stats error]", e);
                setPersonalStats(prev => ({
                    ...prev,
                    jour: {
                        dons: 0,
                        // Initialisez d'autres statistiques si nécessaire
                    }
                }));
            }
        };

        fetchDailyStats();
    }, [user?.id]);
    useEffect(() => {
        if (!user?.id) return;

        const fetchWeeklyStats = async () => {
            try {
                const from = yyyymmdd(weekStart);
                const to = yyyymmdd(endOfWeek(weekStart));

                const { data, error } = await supabase
                    .from("donations")
                    .select("total_donation")
                    .eq("collector_id", user.id)
                    .gte("date", `${from}T00:00:00`)
                    .lte("date", `${to}T23:59:59`);

                if (error) throw error;

                const safeData = Array.isArray(data) ? data : [];

                // Calculer la SOMME des dons (pas le compte)
                const totalDons = safeData.reduce((sum, donation) => {
                    const amount = Number(donation.total_donation);
                    return sum + (isFinite(amount) ? amount : 0);
                }, 0);

                const portes = safeData.reduce((acc, transaction) => {
                    const doors = Number(transaction.doors_knocked);
                    return acc + (isFinite(doors) ? doors : 0);
                }, 0);

                const acceptes = safeData.filter(t => t.status === 'accepted').length;
                const refus = safeData.filter(t => t.status === 'refused').length;
                const absents = safeData.filter(t => t.status === 'absent').length;

                const temps = safeData.reduce((acc, transaction) => {
                    const time = Number(transaction.time_spent);
                    return acc + (isFinite(time) ? time : 0);
                }, 0);

                setPersonalStats(prev => ({
                    ...prev,
                    semaine: {
                        dons: totalDons,
                        portes: portes,
                        acceptes: acceptes,
                        refus: refus,
                        absents: absents,
                        temps: temps
                    }
                }));

            } catch (e) {
                console.log("[Weekly stats error]", e);
                setPersonalStats(prev => ({
                    ...prev,
                    semaine: {
                        dons: 0,
                        portes: 0,
                        acceptes: 0,
                        refus: 0,
                        absents: 0,
                        temps: 0
                    }
                }));
            }
        };

        fetchWeeklyStats();
    }, [user?.id, weekStart]);
    useEffect(() => {
        if (!user?.id) return;

        (async () => {
            setLoadingAj(true);
            setErrorAj(null);

            try {
                const from = yyyymmdd(weekStart);
                const to = yyyymmdd(endOfWeek(weekStart));

                if (!from || !to) {
                    throw new Error("Dates invalides");
                }
                const query = supabase
                    .from("caissier_ajustements")
                    .select("id, dref, total, e, s, v, c")
                    .gte("dref", from)
                    .eq("collector_id", user.id)
                    .lte("dref", to)
                    .order("dref", { ascending: false });

                const { data, error } = await query;
                if (error) throw error;

                setAjustements(Array.isArray(data) ? data : []);
            } catch (e) {
                console.log("[Ajustements error]", e);
                setErrorAj(e?.message || "Erreur de chargement");
                setAjustements([]);
            } finally {
                setLoadingAj(false);
            }
        })();
    }, [user?.id, weekStart]);

    // Charger les dons hebdomadaires pour le graphique
    useEffect(() => {
        if (!user?.id) return;

        const fetchWeeklyDonationsData = async () => {
            setLoadingDonations(true);
            setErrorDonations(null);

            try {
                const from = yyyymmdd(weekStart);
                const to = yyyymmdd(endOfWeek(weekStart));

                const { data, error } = await supabase
                    .from("donations")
                    .select("total_donation, date")
                    .eq("collector_id", user.id)
                    .gte("date", `${from}T00:00:00`)
                    .lte("date", `${to}T23:59:59`)
                    .order("date", { ascending: true });

                if (error) throw error;

                // Grouper les dons par jour de la semaine
                const weeklyData = Array(7).fill(0);

                data.forEach(donation => {
                    const donationDate = new Date(donation.date);
                    const dayOfWeek = (donationDate.getDay() + 6) % 7; // Lundi=0, Dimanche=6
                    weeklyData[dayOfWeek] += Number(donation.total_donation) || 0;
                });

                setDailyDonations(weeklyData);

            } catch (e) {
                console.log("[Weekly donations data error]", e);
                setErrorDonations(e?.message || "Erreur de chargement des dons hebdomadaires");
                setDailyDonations([]);
            } finally {
                setLoadingDonations(false);
            }
        };

        fetchWeeklyDonationsData();
    }, [user?.id, weekStart]);

    // Charger les transactions
    useEffect(() => {
        if (!user?.id) return;

        (async () => {
            setLoadingTransactions(true);
            setErrorTransactions(null);

            try {
                let query = supabase
                    .from("donations")
                    .select("*")
                    .eq("collector_id", user.id)
                    .order("date", { ascending: false });

                if (selectedDate) {
                    query = query
                        .gte("date", `${selectedDate}T00:00:00`)
                        .lte("date", `${selectedDate}T23:59:59`);
                }
                const { data, error } = await query;
                if (error) throw error;

                console.log("Données des donations:", data);
                setTransactions(Array.isArray(data) ? data : []);
            } catch (e) {
                console.log("[Transactions error]", e);
                setErrorTransactions(e?.message || "Erreur de chargement des transactions");
                setTransactions([]);
            } finally {
                setLoadingTransactions(false);
            }
        })();
    }, [user?.id, selectedDate]);

    // Charger les données de production (portes frappées)
    useEffect(() => {
        if (!user?.id) return;

        (async () => {
            setLoadingProduction(true);
            setErrorProduction(null);

            try {
                const from = yyyymmdd(doorsWeekStart);
                const to = yyyymmdd(endOfWeek(doorsWeekStart));

                if (!from || !to) {
                    throw new Error("Dates invalides");
                }
                const { data, error } = await supabase
                    .from("donations")
                    .select("id, date")
                    .eq("collector_id", user.id)
                    .gte("date", `${from}T00:00:00`)
                    .lte("date", `${to}T23:59:59`)
                    .order("date", { ascending: true });

                if (error) throw error;

                setProductionData(Array.isArray(data) ? data : []);
            } catch (e) {
                console.log("[Donations count error]", e);
                setErrorProduction(e?.message || "Erreur de chargement des donations");
                setProductionData([]);
            } finally {
                setLoadingProduction(false);
            }
        })();
    }, [user?.id, doorsWeekStart]);

    // Charger les commissions
    useEffect(() => {
        if (!user?.id) return;

        (async () => {
            setLoadingCommission(true);
            setErrorCommission(null);
            try {
                const { data, error } = await supabase
                    .from("wallet")
                    .select('id, commission')
                    .eq('user_id', user.id);

                if (error) throw error;

                if (Array.isArray(data) && data.length > 0) {
                    const commRaw = data[0].commission;

                    setCommissionHistory([
                        { amount: Number(commRaw) || 0, date: null }
                    ]);
                } else {
                    setCommissionHistory([]);
                }
            } catch (e) {
                console.log('[Commission error]', e);
                setErrorCommission(e.message || 'Erreur de chargement des commissions');
                setCommissionHistory([]);
            } finally {
                setLoadingCommission(false);
            }
        })();
    }, [user?.id]);

    // Fonctions utilitaires
    const aggregateTransactionsByDate = (transactions) => {
        const aggregated = {};

        if (!transactions || !Array.isArray(transactions)) {
            return aggregated;
        }

        transactions.forEach((transaction) => {
            if (!transaction || !transaction.date) return;

            const dateKey = new Date(transaction.date).toLocaleDateString('fr-FR');
            const amount = Number(transaction.total_donation) || 0;
            if (!aggregated[dateKey]) {
                aggregated[dateKey] = { total: 0, transactions: [] };
            }
            aggregated[dateKey].total += amount;
            aggregated[dateKey].transactions.push(transaction);
        });
        return aggregated;
    };

    const weeklyTotals = useMemo(() => {
        const totals = Array(7).fill(0);

        if (!Array.isArray(ajustements)) return totals;

        ajustements.forEach((row) => {
            try {
                if (!row?.dref) return;

                const date = new Date(row.dref + "T00:00:00");
                if (isNaN(date.getTime())) return;

                const idx = (date.getDay() + 6) % 7;
                if (idx < 0 || idx >= 7) return;

                const val = Number(row.total || 0);
                if (isFinite(val) && val >= 0) {
                    totals[idx] += val;
                }
            } catch (e) {
                console.log("Erreur processing row:", e, row);
            }
        });

        return totals;
    }, [ajustements]);

    const weekLabel = useMemo(() => {
        try {
            const a = weekStart;
            const b = endOfWeek(weekStart);
            const sameMonth = a.getMonth() === b.getMonth();

            const fmt = (d) => {
                const day = String(d.getDate()).padStart(2, "0");
                const month = d.toLocaleString("fr-FR", { month: "short" });
                return `${day} ${month}`;
            };

            const left = fmt(a);
            const right = sameMonth ? String(b.getDate()).padStart(2, "0") : fmt(b);
            return `${left} → ${right} ${b.getFullYear()}`;
        } catch (e) {
            return "Semaine invalide";
        }
    }, [weekStart]);

    const totalSemaineAjust = useMemo(() => {
        try {
            return weeklyTotals.reduce((a, b) => {
                const valA = Number(a) || 0;
                const valB = Number(b) || 0;
                return valA + valB;
            }, 0);
        } catch (e) {
            return 0;
        }
    }, [weeklyTotals]);

    const totalSemaineDons = useMemo(() => {
        try {
            const safeDonations = Array.isArray(dailyDonations) ? dailyDonations : Array(7).fill(0);
            return safeDonations.reduce((sum, val) => sum + (Number(val) || 0), 0);
        } catch (e) {
            return 0;
        }
    }, [dailyDonations]);

    const weeklyProduction = useMemo(() => {
        const donationsByDay = Array(7).fill(0);

        if (!Array.isArray(productionData)) return donationsByDay;

        productionData.forEach((donation) => {
            try {
                if (!donation?.date) return;

                const date = new Date(donation.date);
                if (isNaN(date.getTime())) return;

                const dayOfWeek = (date.getDay() + 6) % 7;
                if (dayOfWeek < 0 || dayOfWeek >= 7) return;

                donationsByDay[dayOfWeek] += Number(donation.doors_knocked) || 0;
            } catch (e) {
                console.log("Erreur processing donation:", e, donation);
            }
        });

        return donationsByDay;
    }, [productionData]);

    const doorsWeekLabel = useMemo(() => {
        try {
            const a = doorsWeekStart;
            const b = endOfWeek(doorsWeekStart);
            const sameMonth = a.getMonth() === b.getMonth();
            const fmt = (d) => {
                const day = String(d.getDate()).padStart(2, "0");
                const month = d.toLocaleString("fr-FR", { month: "short" });
                return `${day} ${month}`;
            };

            const left = fmt(a);
            const right = sameMonth ? String(b.getDate()).padStart(2, "0") : fmt(b);
            return `${left} → ${right} ${b.getFullYear()}`;
        } catch (e) {
            return "Semaine invalide";
        }
    }, [doorsWeekStart]);

    const handleDateChange = (event, date) => {
        setShowDatePicker(false);
        if (date) {
            setSelectedDate(yyyymmdd(date));
        }
    };

    const clearDateFilter = () => {
        setSelectedDate(null);
    };

    const confirmLogout = () => {
        Alert.alert("Déconnexion", "Voulez-vous vraiment vous déconnecter ?", [
            { text: "Annuler", style: "cancel" },
            { text: "Oui", style: "destructive", onPress: logout },
        ]);
    };

    const handleChartLayout = (event) => {
        const { width } = event.nativeEvent.layout;
        if (isFinite(width) && width > 0) {
            setChartW(width);
        }
    };

    return (
        <SafeAreaView style={s.container}>
            <StatusBar style={isDark ? "light" : "dark"} />

            <View style={s.header}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={[s.headerAvatarRing, { borderColor: theme.colors.accent }]}>
                        <Image source={{ uri: "https://via.placeholder.com/150" }} style={s.avatarImg} />
                    </View>
                    <View>
                        <Text style={s.hello}>Bonjour</Text>
                        <Text style={s.headerName}>{userName || "Utilisateur"}</Text>
                        {(userPosteLabel || user?.poste?.nom) && (
                            <Text style={s.posteIdText}>
                                Poste :{" "}
                                <Text style={{ fontWeight: "700", color: theme.colors.textPrimary }}>
                                    {userPosteLabel || user?.poste?.nom}
                                </Text>
                            </Text>
                        )}
                    </View>
                </View>

                <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                    <TouchableOpacity onPress={toggleTheme}>
                        <Ionicons name={isDark ? "sunny" : "moon"} size={20} color={theme.colors.textPrimary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={cycleTheme}>
                        <Ionicons name="sync" size={18} color={theme.colors.textPrimary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={confirmLogout}>
                        <Ionicons name="log-out-outline" size={20} color="#F43F5E" />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
                {!personalStats ? (
                    <View style={{ alignItems: 'center', marginTop: 40 }}>
                        <ActivityIndicator size="large" color={theme.colors.accent} />
                        <Text style={{ color: theme.colors.textSecondary, marginTop: 10 }}>Chargement...</Text>
                    </View>
                ) : (
                    <View style={{ gap: 16 }}>
                        <View style={{ flexDirection: "row", gap: 12 }}>
                            <View style={[s.card, { flex: 1 }]}>
                                <Text style={s.pillHeader}>Jour</Text>
                                <View style={s.pillWrap}>
                                    <StatChip
                                        theme={{ ...theme, isDark }}
                                        tone="green"
                                        icon={<Ionicons name="cash-outline" size={14} color="#10B981" />}
                                        value={personalStats.jour.dons}
                                        formatter={(v) => `${v} $`}
                                    />
                                    <StatChip
                                        theme={{ ...theme, isDark }}
                                        tone="blue"
                                        icon={<MaterialCommunityIcons name="door-closed" size={14} color="#3B82F6" />}
                                        value={personalStats.jour.portes}
                                    />
                                    <StatChip
                                        theme={{ ...theme, isDark }}
                                        tone="green"
                                        icon={<Ionicons name="checkmark-circle-outline" size={14} color="#10B981" />}
                                        value={personalStats.jour.acceptes}
                                    />
                                    <StatChip
                                        theme={{ ...theme, isDark }}
                                        tone="red"
                                        icon={<Ionicons name="close-circle-outline" size={14} color="#EF4444" />}
                                        value={personalStats.jour.refus}
                                    />
                                    <StatChip
                                        theme={{ ...theme, isDark }}
                                        tone="muted"
                                        icon={<Ionicons name="remove-circle-outline" size={14} color="#9CA3AF" />}
                                        value={personalStats.jour.absents}
                                    />
                                    <StatChip
                                        theme={{ ...theme, isDark }}
                                        tone="amber"
                                        icon={<Ionicons name="time-outline" size={14} color="#F59E0B" />}
                                        value={personalStats.jour.temps}
                                        suffix="h"
                                    />
                                </View>
                            </View>
                            <View style={[s.card, { flex: 1 }]}>
                                <Text style={s.pillHeader}>Semaine</Text>
                                <View style={s.pillWrap}>
                                    <StatChip
                                        theme={{ ...theme, isDark }}
                                        tone="green"
                                        icon={<Ionicons name="cash-outline" size={14} color="#10B981" />}
                                        value={personalStats.semaine.dons}
                                        formatter={(v) => formatCurrency(v)}
                                    />
                                    <StatChip
                                        theme={{ ...theme, isDark }}
                                        tone="blue"
                                        icon={<MaterialCommunityIcons name="door-closed" size={14} color="#3B82F6" />}
                                        value={personalStats.semaine.portes}
                                    />
                                    <StatChip
                                        theme={{ ...theme, isDark }}
                                        tone="green"
                                        icon={<Ionicons name="checkmark-circle-outline" size={14} color="#10B981" />}
                                        value={personalStats.semaine.acceptes}
                                    />
                                    <StatChip
                                        theme={{ ...theme, isDark }}
                                        tone="red"
                                        icon={<Ionicons name="close-circle-outline" size={14} color="#EF4444" />}
                                        value={personalStats.semaine.refus}
                                    />
                                    <StatChip
                                        theme={{ ...theme, isDark }}
                                        tone="muted"
                                        icon={<Ionicons name="remove-circle-outline" size={14} color="#9CA3AF" />}
                                        value={personalStats.semaine.absents}
                                    />
                                    <StatChip
                                        theme={{ ...theme, isDark }}
                                        tone="amber"
                                        icon={<Ionicons name="time-outline" size={14} color="#F59E0B" />}
                                        value={personalStats.semaine.temps}
                                        suffix="h"
                                    />
                                </View>
                            </View>
                        </View>

                        <View style={s.card}>
                            <Text style={s.cardTitle}>Performance hebdomadaire</Text>
                            <Text style={s.sectionTitle}>Dons par jour</Text>
                            <View
                                onLayout={handleChartLayout}
                                style={[s.graphContainer, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}
                            >
                                {loadingDonations ? (
                                    <ActivityIndicator color={theme.colors.accent} />
                                ) : errorDonations ? (
                                    <View style={{ alignItems: 'center', gap: 4 }}>
                                        <Ionicons name="alert-circle-outline" size={24} color="#DC2626" />
                                        <Text style={{ color: "#DC2626", fontSize: 12, textAlign: 'center' }}>
                                            {String(errorDonations)}
                                        </Text>
                                    </View>
                                ) : dailyDonations.length === 0 ? (
                                    <View style={{ alignItems: 'center', gap: 4 }}>
                                        <Ionicons name="bar-chart-outline" size={24} color={theme.colors.textSecondary} />
                                        <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>
                                            Aucune donnée de dons cette semaine
                                        </Text>
                                    </View>
                                ) : chartW > 0 ? (
                                    <WeeklyBarChart
                                        theme={theme}
                                        values={dailyDonations}
                                        width={chartW}
                                        labelFormatter={(v) => `${v} $`}
                                    />
                                ) : (
                                    <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>
                                        Calcul des dimensions...
                                    </Text>
                                )}
                            </View>
                            <View style={{ marginTop: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                                <Text style={{ color: theme.colors.textSecondary }}>Total semaine</Text>
                                <Text style={{ color: theme.colors.textPrimary, fontWeight: "700" }}>
                                    {formatCurrency(totalSemaineDons)}
                                </Text>
                            </View>

                            <Text style={[s.sectionTitle, { marginTop: 16 }]}>Portes frappées par jour</Text>
                            <View style={[styles.rowCenter, { justifyContent: "space-between", marginBottom: 8 }]}>
                                <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>
                                    Semaine: {doorsWeekLabel}
                                </Text>
                                <View style={[styles.rowCenter, { gap: 8 }]}>
                                    <TouchableOpacity
                                        onPress={() => setDoorsWeekStart(addDays(doorsWeekStart, -7))}
                                        style={[s.navBtn, { borderColor: theme.colors.border }]}
                                    >
                                        <Ionicons name="chevron-back" size={16} color={theme.colors.textSecondary} />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => setDoorsWeekStart(addDays(doorsWeekStart, 7))}
                                        style={[s.navBtn, { borderColor: theme.colors.border }]}
                                    >
                                        <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} />
                                    </TouchableOpacity>
                                </View>
                            </View>
                            <View
                                onLayout={handleChartLayout}
                                style={[s.graphContainer, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}
                            >
                                {loadingProduction ? (
                                    <ActivityIndicator color={theme.colors.accent} />
                                ) : errorProduction ? (
                                    <View style={{ alignItems: 'center', gap: 4 }}>
                                        <Ionicons name="alert-circle-outline" size={24} color="#DC2626" />
                                        <Text style={{ color: "#DC2626", fontSize: 12, textAlign: 'center' }}>
                                            {String(errorProduction)}
                                        </Text>
                                    </View>
                                ) : weeklyProduction.every((v) => v === 0) ? (
                                    <View style={{ alignItems: 'center', gap: 4 }}>
                                        <Ionicons name="bar-chart-outline" size={24} color={theme.colors.textSecondary} />
                                        <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>
                                            Aucune donnée de production cette semaine
                                        </Text>
                                    </View>
                                ) : chartW > 0 ? (
                                    <WeeklyBarChart
                                        theme={theme}
                                        values={weeklyProduction}
                                        width={chartW}
                                        labelFormatter={(v) => `${v} portes`}
                                    />
                                ) : (
                                    <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>
                                        Calcul des dimensions...
                                    </Text>
                                )}
                            </View>
                            <View style={{ marginTop: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                                <Text style={{ color: theme.colors.textSecondary }}>Total semaine</Text>
                                <Text style={{ color: theme.colors.textPrimary, fontWeight: "700" }}>
                                    {weeklyProduction.reduce((sum, val) => sum + val, 0)} portes
                                </Text>
                            </View>
                        </View>

                        <View style={s.card}>
                            <Text style={s.cardTitle}>Historique</Text>
                            <View style={{ marginTop: 6 }}>
                                <View style={[styles.rowCenter, { justifyContent: "space-between", marginBottom: 8 }]}>
                                    <Text style={s.sectionTitle}>Historique ajustement</Text>
                                    <View style={[styles.rowCenter, { gap: 8 }]}>
                                        <TouchableOpacity
                                            onPress={() => setWeekStart(addDays(weekStart, -7))}
                                            style={[s.navBtn, { borderColor: theme.colors.border }]}
                                        >
                                            <Ionicons name="chevron-back" size={16} color={theme.colors.textSecondary} />
                                        </TouchableOpacity>
                                        <Text style={{ color: theme.colors.textSecondary, fontWeight: "600" }}>
                                            {weekLabel}
                                        </Text>
                                        <TouchableOpacity
                                            onPress={() => setWeekStart(addDays(weekStart, 7))}
                                            style={[s.navBtn, { borderColor: theme.colors.border }]}
                                        >
                                            <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                {loadingAj ? (
                                    <ActivityIndicator color={theme.colors.accent} style={{ marginVertical: 20 }} />
                                ) : errorAj ? (
                                    <View style={{ alignItems: 'center', gap: 4, paddingVertical: 16 }}>
                                        <Ionicons name="alert-circle-outline" size={24} color="#DC2626" />
                                        <Text style={{ color: "#DC2626", fontSize: 12, textAlign: 'center' }}>
                                            {String(errorAj)}
                                        </Text>
                                    </View>
                                ) : ajustements.length === 0 ? (
                                    <View style={{ alignItems: 'center', gap: 4, paddingVertical: 16 }}>
                                        <Ionicons name="receipt-outline" size={24} color={theme.colors.textSecondary} />
                                        <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>
                                            Aucun ajustement pour cette semaine
                                        </Text>
                                    </View>
                                ) : (
                                    <View style={s.ajustementsList}>
                                        {ajustements.slice(0, 6).map((ajustement, index) => (
                                            <View
                                                key={ajustement.id || index}
                                                style={[
                                                    s.ajustementItem,
                                                    { borderBottomColor: theme.colors.border },
                                                    index === ajustements.length - 1 && { borderBottomWidth: 0 }
                                                ]}
                                            >
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ color: theme.colors.textPrimary, fontWeight: "600" }}>
                                                        Date: {ajustement.dref ? formatDateToFrench(ajustement.dref) : "Date inconnue"}
                                                    </Text>
                                                    <View style={[styles.rowCenter, { marginTop: 4, flexWrap: 'wrap', gap: 8 }]}>
                                                        <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>
                                                            E: {ajustement.e || 0}
                                                        </Text>
                                                        <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>
                                                            S: {ajustement.s || 0}
                                                        </Text>
                                                        <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>
                                                            V: {ajustement.v || 0}
                                                        </Text>
                                                        <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>
                                                            C: {ajustement.c || 0}
                                                        </Text>
                                                    </View>
                                                </View>
                                                <View style={{ alignItems: 'flex-end' }}>
                                                    <Text style={{ color: theme.colors.textPrimary, fontWeight: "700" }}>
                                                        {formatCurrency(ajustement.total || 0)}
                                                    </Text>
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </View>

                            <Text style={[s.sectionTitle, { marginTop: 12 }]}>Historique commission</Text>
                            <View style={{ marginTop: 6 }}>
                                {loadingCommission ? (
                                    <ActivityIndicator color={theme.colors.accent} />
                                ) : errorCommission ? (
                                    <View style={{ alignItems: 'center', gap: 4 }}>
                                        <Ionicons name="alert-circle-outline" size={24} color="#DC2626" />
                                        <Text style={{ color: "#DC2626", fontSize: 12, textAlign: 'center' }}>
                                            {errorCommission}
                                        </Text>
                                    </View>
                                ) : commissionHistory.length === 0 ? (
                                    <View style={{ alignItems: 'center', gap: 4, paddingVertical: 16 }}>
                                        <Ionicons name="cash-outline" size={24} color={theme.colors.textSecondary} />
                                        <Text style={{ color: theme.colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
                                            Aucune commission disponible
                                        </Text>
                                    </View>
                                ) : (
                                    <View style={s.transactionsList}>
                                        {commissionHistory.map((item, index) => (
                                            <View
                                                key={index}
                                                style={[
                                                    s.transactionItem,
                                                    { borderBottomColor: theme.colors.border },
                                                    index === commissionHistory.length - 1 && { borderBottomWidth: 0 }
                                                ]}
                                            >
                                                <Text style={{ color: theme.colors.textPrimary, fontWeight: '600' }}>
                                                    {item.amount ? formatCurrency(item.amount) : 'Montant non spécifié'}
                                                </Text>
                                                <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>
                                                    {item.date ? new Date(item.date).toLocaleDateString('fr-FR') : 'Date inconnue'}
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </View>

                            <View style={{ marginTop: 16 }}>
                                <View style={[styles.rowCenter, { justifyContent: "space-between", marginBottom: 8 }]}>
                                    <Text style={s.sectionTitle}>Historique transaction</Text>

                                    <View style={[styles.rowCenter, { gap: 6 }]}>
                                        {selectedDate && (
                                            <TouchableOpacity onPress={clearDateFilter}>
                                                <Ionicons name="close-circle" size={16} color={theme.colors.textSecondary} />
                                            </TouchableOpacity>
                                        )}
                                        <TouchableOpacity
                                            style={[s.filterButton, { borderColor: theme.colors.border }]}
                                            onPress={() => setShowDatePicker(true)}
                                        >
                                            <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>
                                                {selectedDate ? formatDateToFrench(selectedDate) : "Toutes dates"}
                                            </Text>
                                            <Ionicons name="calendar-outline" size={14} color={theme.colors.textSecondary} style={{ marginLeft: 4 }} />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                {showDatePicker && (
                                    <DateTimePicker
                                        value={selectedDate ? new Date(selectedDate) : new Date()}
                                        mode="date"
                                        display="default"
                                        onChange={handleDateChange}
                                    />
                                )}

                                {loadingTransactions ? (
                                    <ActivityIndicator color={theme.colors.accent} style={{ marginVertical: 20 }} />
                                ) : errorTransactions ? (
                                    <View style={{ alignItems: 'center', gap: 4, paddingVertical: 16 }}>
                                        <Ionicons name="alert-circle-outline" size={24} color="#DC2626" />
                                        <Text style={{ color: "#DC2626", fontSize: 12, textAlign: 'center' }}>
                                            {String(errorTransactions)}
                                        </Text>
                                    </View>
                                ) : transactions.length === 0 ? (
                                    <View style={{ alignItems: 'center', gap: 4, paddingVertical: 16 }}>
                                        <Ionicons name="receipt-outline" size={24} color={theme.colors.textSecondary} />
                                        <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>
                                            Aucune transaction {selectedDate ? `pour le ${formatDateToFrench(selectedDate)}` : ""}
                                        </Text>
                                    </View>
                                ) : (
                                    <View style={s.transactionsList}>
                                        {transactions.map((transaction, index) => (
                                            <View
                                                key={transaction.id || index}
                                                style={[
                                                    s.transactionItem,
                                                    { borderBottomColor: theme.colors.border },
                                                    index === transactions.length - 1 && { borderBottomWidth: 0 }
                                                ]}
                                            >
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ color: theme.colors.textPrimary, fontWeight: "600" }}>
                                                        {transaction.total_donation ? formatCurrency(transaction.total_donation) : "Montant non spécifié"}
                                                    </Text>
                                                    <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                                                        {transaction.date ? new Date(transaction.date).toLocaleString('fr-FR') : "Date inconnue"}
                                                    </Text>
                                                </View>
                                                <View style={{ alignItems: 'flex-end' }}>
                                                    {transaction.method && (
                                                        <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                                                            {transaction.method}
                                                        </Text>
                                                    )}
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </View>
                        </View>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    rowCenter: { flexDirection: "row", alignItems: "center" },
    dot: { width: 6, height: 6, borderRadius: 3 },
});

const createStyles = (theme) =>
    StyleSheet.create({
        container: { flex: 1, backgroundColor: theme.colors.background },
        content: { paddingHorizontal: 12, paddingBottom: 24 },

        header: {
            paddingHorizontal: 18,
            paddingTop: 6,
            paddingBottom: 10,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
        },
        hello: { color: theme.colors.textSecondary, fontSize: 14 },
        headerName: { color: theme.colors.textPrimary, fontSize: 24, fontWeight: "700" },
        posteIdText: { color: theme.colors.textSecondary, fontSize: 14, marginTop: 2 },
        headerAvatarRing: {
            width: 46,
            height: 46,
            borderRadius: 23,
            borderWidth: 2,
            overflow: "hidden",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.colors.card,
        },
        avatarImg: { width: 42, height: 42, borderRadius: 21 },

        card: {
            backgroundColor: theme.colors.card,
            borderRadius: 18,
            padding: 16,
            borderWidth: 1,
            borderColor: theme.colors.border,
            shadowColor: "#000",
            shadowOpacity: 0.04,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: 1,
        },
        cardTitle: {
            fontSize: 16,
            fontWeight: "700",
            color: theme.colors.textPrimary,
            marginBottom: 8,
        },

        pillHeader: {
            fontSize: 12,
            fontWeight: "700",
            color: theme.colors.textSecondary,
            marginBottom: 10,
            textTransform: "uppercase",
            letterSpacing: 0.5,
        },
        pillWrap: {
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
        },

        sectionTitle: {
            fontSize: 13,
            fontWeight: "600",
            color: theme.colors.textPrimary,
            marginTop: 4,
        },
        graphPlaceholderDashed: {
            height: 120,
            borderRadius: 12,
            marginTop: 6,
            backgroundColor: theme.colors.background,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderStyle: "dashed",
        },

        bigPercent: { fontSize: 28, fontWeight: "800" },

        graphContainer: {
            minHeight: 180,
            borderWidth: 1,
            borderStyle: "solid",
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 8,
            paddingHorizontal: 6,
        },
        navBtn: {
            width: 28,
            height: 28,
            borderRadius: 8,
            borderWidth: 1,
            alignItems: "center",
            justifyContent: "center",
        },

        filterButton: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 8,
            borderWidth: 1,
        },

        transactionsList: {
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: 12,
            overflow: 'hidden',
        },
        ajustementsList: {
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: 12,
            overflow: 'hidden',
        },

        ajustementItem: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 12,
            borderBottomWidth: 1,
        },
        transactionItem: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 12,
            borderBottomWidth: 1,
        },
    });
