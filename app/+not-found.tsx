import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { C } from '@/constants/theme';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <Text style={styles.title}>This screen doesn't exist.</Text>
        <Link href="/" style={styles.link}>
          <Text style={{ color: C.accent }}>Go home</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: C.bg },
  title: { fontSize: 20, fontWeight: 'bold', color: C.text },
  link: { marginTop: 15, paddingVertical: 15 },
});
