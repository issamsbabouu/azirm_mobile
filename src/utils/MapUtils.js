import { Alert, Linking } from 'react-native';
export const openGoogleMaps = (location) => {
    if (!location?.location_lat || !location?.location_lng) {
        Alert.alert('Erreur', 'Coordonnées GPS manquantes.');
        return;
    }

    const url = `https://www.google.com/maps/dir/?api=1&destination=${location.location_lat},${location.location_lng}&travelmode=driving`;

    Linking.canOpenURL(url)
        .then((supported) => {
            if (supported) {
                Linking.openURL(url).catch((err) => {
                    console.error('Erreur lors de l’ouverture de Google Maps :', err);
                    Alert.alert('Erreur', 'Impossible d’ouvrir Google Maps.');
                });
            } else {
                Alert.alert('Erreur', 'Google Maps n’est pas disponible sur cet appareil.');
            }
        })
        .catch((err) => {
            console.error('Erreur Linking :', err);
            Alert.alert('Erreur', 'Impossible d’ouvrir Google Maps.');
        });
};
