import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

async function generateAndSaveReceiptPDF(data) {
    const html = `
    <html>
      <body style="font-family: Arial; padding: 20px;">
        <h2>Reçu de don</h2>
        <p><strong>Nom :</strong> ${data.contactPerson}</p>
        <p><strong>Email :</strong> ${data.email}</p>
        <p><strong>Montant :</strong> ${data.donationAmount} MAD</p>
        <p><strong>Méthode :</strong> ${
        data.donationType === 'Autres' ? data.customPaymentMethod : data.donationType
    }</p>
        <p><strong>Date :</strong> ${new Date().toLocaleDateString()}</p>
      </body>
    </html>
  `;

    const { uri } = await Print.printToFileAsync({ html });
    const filename = `${FileSystem.documentDirectory}recu_don.pdf`;

    await FileSystem.moveAsync({ from: uri, to: filename });

    if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filename);
    }

    return filename;
}
