import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

interface TwinLogoProps {
  size?: number;
}

export default function TwinLogo({ size = 120 }: TwinLogoProps) {
  return (
    <View style={styles.container}>
      <Image
        // eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef
        source={require('../assets/splash-icon.png')}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
