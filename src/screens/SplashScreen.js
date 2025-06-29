import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, ScrollView, TouchableOpacity, StatusBar, SafeAreaView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
const { width, height } = Dimensions.get('window');
const OnboardingScreen = ({ onComplete, navigation }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const scrollViewRef = useRef(null);
    const onboardingData = [
        {
            id: 1,
            title: "Donnez avec le cœur",
            subtitle: "Aidez ceux qui en ont besoin",
            description: "Participez à des causes qui vous tiennent à cœur et faites la différence dans votre communauté.",
            color: "#8B5CF6",
            gradientColors: ["#8B5CF6", "#A78BFA"],
        },
        {
            id: 2,
            title: "Transparent et sécurisé",
            subtitle: "Suivez l'impact de vos dons",
            description: "Découvrez exactement comment vos donations sont utilisées grâce à notre système de traçabilité.",
            color: "#3B82F6",
            gradientColors: ["#3B82F6", "#60A5FA"],
        },
        {
            id: 3,
            title: "Communauté solidaire",
            subtitle: "Ensemble, nous sommes plus forts",
            description: "Rejoignez une communauté bienveillante et engagée pour maximiser votre impact social.",
            color: "#8B5CF6",
            gradientColors: ["#8B5CF6", "#EC4899"],
        },
    ];
    const handleScroll = (event) => {
        const scrollPosition = event.nativeEvent.contentOffset.x;
        const index = Math.round(scrollPosition / width);
        setCurrentIndex(index);
    };
    const goToNext = () => {
        if (currentIndex < onboardingData.length - 1) {
            const nextIndex = currentIndex + 1;
            scrollViewRef.current?.scrollTo({
                x: nextIndex * width,
                animated: true,
            });
            setCurrentIndex(nextIndex);
        } else {
            handleComplete();
        }
    };
    const handleComplete = () => {
        if (navigation) {
            navigation.navigate('Login');
        } else if (onComplete) {
            onComplete();
        }
    };
    const handleSkip = () => {
        handleComplete();
    };
    const PlaceholderImage = ({ gradientColors, title }) => (
        <LinearGradient
            colors={gradientColors}
            style={styles.placeholderImage}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
        >
            <View style={styles.imageContent}>
                <Text style={styles.imageTitle}>{title}</Text>
                <View style={styles.iconContainer}>
                    {title.includes('cœur') && <Text style={styles.icon}>💝</Text>}
                    {title.includes('Transparent') && <Text style={styles.icon}>🔒</Text>}
                    {title.includes('Communauté') && <Text style={styles.icon}>🤝</Text>}
                </View>
            </View>
        </LinearGradient>
    );
    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
            <View style={styles.header}>
                <Text style={styles.logoText}>Azirm Foundation</Text>
                <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
                    <Text style={styles.skipButtonText}>Passer</Text>
                </TouchableOpacity>
            </View>
            <ScrollView
                ref={scrollViewRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                style={styles.scrollView}
            >
                {onboardingData.map((item) => (
                    <View key={item.id} style={styles.slide}>
                        <View style={styles.imageContainer}>
                            <PlaceholderImage
                                gradientColors={item.gradientColors}
                                title={item.title}
                            />
                        </View>

                        <View style={styles.textContainer}>
                            <Text style={styles.title}>{item.title}</Text>
                            <Text style={styles.subtitle}>{item.subtitle}</Text>
                            <Text style={styles.description}>{item.description}</Text>
                        </View>
                    </View>
                ))}
            </ScrollView>
            <View style={styles.pageIndicator}>
                {onboardingData.map((_, index) => (
                    <View
                        key={index}
                        style={[
                            styles.dot,
                            index === currentIndex ? styles.activeDot : styles.inactiveDot,
                        ]}
                    />
                ))}
            </View>
            <View style={styles.buttonContainer}>
                <TouchableOpacity style={styles.actionButton} onPress={goToNext}>
                    <LinearGradient
                        colors={currentIndex === onboardingData.length - 1 ? ['#8B5CF6', '#EC4899'] : ['#8B5CF6', '#3B82F6']}
                        style={styles.gradientButton}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                    >
                        <Text style={styles.buttonText}>
                            {currentIndex === onboardingData.length - 1 ? "C'est parti ! 🚀" : "Suivant"}
                        </Text>
                    </LinearGradient>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 20,
        paddingTop: 40,
    },
    logoText: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#8B5CF6',
        flex: 1,
        textAlign: 'center',
    },
    skipButton: {
        padding: 8,
        position: 'absolute',
        right: 20,
        top: 40,
    },
    skipButtonText: {
        color: '#9CA3AF',
        fontSize: 16,
        fontWeight: '500',
    },
    scrollView: {
        flex: 1,
    },
    slide: {
        width,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 30,
    },
    imageContainer: {
        width: width * 0.8,
        height: height * 0.35,
        marginBottom: 40,
        borderRadius: 20,
        overflow: 'hidden',
        elevation: 8,
        shadowColor: '#8B5CF6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    placeholderImage: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    imageContent: {
        alignItems: 'center',
    },
    imageTitle: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 20,
        textAlign: 'center',
    },
    iconContainer: {
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderRadius: 50,
        padding: 20,
    },
    icon: {
        fontSize: 40,
    },
    textContainer: {
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#1F2937',
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#8B5CF6',
        marginBottom: 16,
        textAlign: 'center',
    },
    description: {
        fontSize: 16,
        color: '#6B7280',
        lineHeight: 24,
        textAlign: 'center',
        paddingHorizontal: 10,
    },
    pageIndicator: {
        flexDirection: 'row',
        justifyContent: 'center',
        paddingVertical: 20,
    },
    dot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginHorizontal: 6,
    },
    activeDot: {
        backgroundColor: '#8B5CF6',
        width: 24,
    },
    inactiveDot: {
        backgroundColor: '#E5E7EB',
    },
    buttonContainer: {
        paddingHorizontal: 30,
        paddingBottom: 20,
    },
    actionButton: {
        borderRadius: 25,
        overflow: 'hidden',
    },
    gradientButton: {
        paddingVertical: 16,
        paddingHorizontal: 32,
        alignItems: 'center',
    },
    buttonText: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
    },
});
export default OnboardingScreen;
