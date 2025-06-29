// PaymentScreen.js
import React, { useEffect, useState } from "react";
import { View, Text, Button, Alert } from "react-native";
import { useStripeTerminal } from "@stripe/stripe-terminal-react-native";

export default function PaymentScreen() {
  const {
    initialize,
    discoverReaders,
    connectReader,
    collectPaymentMethod,
    processPayment,
  } = useStripeTerminal();

  const [connectedReader, setConnectedReader] = useState(null);
  const [clientSecret, setClientSecret] = useState(null);

  // Initialisation Stripe Terminal
  useEffect(() => {
    (async () => {
      const init = await initialize({
        onFetchConnectionToken: async () => {
          const res = await fetch("https://backend-azirm.onrender.com/connection_token");
          const { secret } = await res.json();
          return secret;
        },
      });
      if (init.error) Alert.alert("Erreur init", init.error.message);
    })();
  }, []);

  // Découverte + Connexion lecteur simulé
  const handleConnect = async () => {
    const { readers, error } = await discoverReaders({ simulated: true });

    if (error) return Alert.alert("Discover error", error.message);

    if (readers.length > 0) {
      const { reader, error: connectError } = await connectReader(readers[0]);
      if (connectError) return Alert.alert("Erreur connect", connectError.message);
      setConnectedReader(reader);
    } else {
      Alert.alert("Aucun lecteur simulé trouvé");
    }
  };

  // Création PaymentIntent de test via backend
  const handleCreatePaymentIntent = async () => {
    const res = await fetch("https://backend-azirm.onrender.com/create_payment_intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    setClientSecret(data.clientSecret);
  };

  // Collecte et traitement du paiement simulé
  const handlePayment = async () => {
    if (!clientSecret) return Alert.alert("Pas de client secret trouvé");

    const { paymentIntent, error: collectError } = await collectPaymentMethod({
      paymentIntentClientSecret: clientSecret,
    });
    if (collectError) return Alert.alert("Erreur collect", collectError.message);

    const { paymentIntent: confirmed, error: processError } = await processPayment(paymentIntent.id);
    if (processError) return Alert.alert("Erreur process", processError.message);

    Alert.alert("✅ Paiement réussi", `Montant: ${confirmed.amount / 100} ${confirmed.currency.toUpperCase()}`);
  };

  return (
      <View style={{ padding: 20 }}>
        <Text style={{ fontWeight: "bold", fontSize: 18, marginBottom: 20 }}>
          Stripe Terminal (Test Mode)
        </Text>
        <Button title="1. Connecter lecteur simulé" onPress={handleConnect} />
        <View style={{ height: 10 }} />
        <Button
            title="2. Créer PaymentIntent"
            onPress={handleCreatePaymentIntent}
            disabled={!connectedReader}
        />
        <View style={{ height: 10 }} />
        <Button
            title="3. Simuler Paiement"
            onPress={handlePayment}
            disabled={!clientSecret}
        />
      </View>
  );
}
