# Mobile Application

This mobile application is developed with React Native and Expo, featuring authentication, geolocation, and Square payments integration.


## Prerequisites

- Node.js (version 16 or higher)
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- EAS Account (Expo Application Services)
- Expo Go on your mobile device for development

## Installation

1. Clone the project
```bash
git clone [url-du-repo]
cd Projet_Mobile
```

2. Install dependencies
```bash
npm install
# or
yarn install
```

## Development

### Start Development Mode

1. Launch development server
```bash
npx expo start
```

2. Development options:
- Scan QR code with Expo Go (Android)
- Scan QR code with camera (iOS)
- Press 'a' to open on Android emulator
- Press 'i' to open on iOS simulator

### Development Best Practices

- Use hot reloading to see your changes in real-time
- Test regularly on both iOS and Android for compatibility
- Use the Expo console for debugging

## Build with EAS (Expo Application Services)

### Initial Setup

1. Install EAS CLI
```bash
npm install -g eas-cli
```

2. Login to your EAS account
```bash
eas login
```

### Project Configuration

The eas.json file is already configured in your project. It defines the different build profiles.

### Build Commands

#### Development Build
```bash
eas build --profile development --platform android
# or
eas build --profile development --platform ios
```

#### Preview Build
```bash
eas build --profile preview --platform android
# or
eas build --profile preview --platform ios
```

#### Production Build
```bash
eas build --profile production --platform android
# or
eas build --profile production --platform ios
```

### Submit Application

1. For Android (Google Play Store)
```bash
eas submit -p android
```

2. For iOS (App Store)
```bash
eas submit -p ios
```

## Main Features

- User Authentication
- Geolocation
- Square Payments
- Navigation
- Notification Management
- Wallet Management

## Project Structure

- `/src` - Main source code
  - `/components` - Reusable components
  - `/context` - React contexts (AuthContext, etc.)
  - `/navigation` - Navigation configuration
  - `/screens` - Application screens
  - `/services` - Services (geolocation, payments)
  - `/fonctions` - Utility functions

## Environment Variables

Create a `.env` file at the root of the project with the following variables:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SQUARE_APPLICATION_ID=your_square_id
```

## Troubleshooting

### Common Issues

1. If the app doesn't start:
```bash
expo start -c
```

2. If you have dependency issues:
```bash
rm -rf node_modules
npm install
```

3. To clear the cache:
```bash
expo start --clear
```

## Support

For any questions or issues, please create an issue in the repository.

---
Developed with ❤️ by [@issamsbabouu](https://github.com/issamsbabouu) 


# aziirmmmmm
