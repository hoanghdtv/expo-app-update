import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useUpdates } from 'expo-updates';
import { useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BANNER_COLOR, BANNER_TEXT } from './version';

export default function UpdatePanel() {
  const { currentlyRunning, isUpdateAvailable, isUpdatePending, isChecking,
          isDownloading, checkError, downloadError } = useUpdates();
  const [log, setLog] = useState<string[]>([]);
  const append = (line: string) =>
    setLog((prev) => [`${new Date().toISOString().slice(11, 19)}  ${line}`, ...prev]);

  const channel = (Constants.expoConfig?.extra as { updateChannel?: string })?.updateChannel;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={[styles.banner, { backgroundColor: BANNER_COLOR }]}>
        <Text style={styles.bannerText}>{BANNER_TEXT}</Text>
      </View>

      <Text style={styles.row}>updateId: {currentlyRunning.updateId ?? '(none)'}</Text>
      <Text style={styles.row}>createdAt: {currentlyRunning.createdAt?.toISOString() ?? '(none)'}</Text>
      <Text style={styles.row}>runtimeVersion: {currentlyRunning.runtimeVersion}</Text>
      <Text style={styles.row}>channel (từ extra): {channel ?? '(none)'}</Text>
      <Text style={styles.row}>isEmbeddedLaunch: {String(currentlyRunning.isEmbeddedLaunch)}</Text>
      <Text style={styles.row}>isEmergencyLaunch: {String(currentlyRunning.isEmergencyLaunch)}</Text>
      <Text style={styles.row}>
        trạng thái: {isChecking ? 'đang kiểm tra' : isDownloading ? 'đang tải' : 'rảnh'}
        {isUpdateAvailable ? ' · có bản mới' : ''}{isUpdatePending ? ' · chờ restart' : ''}
      </Text>
      {checkError ? <Text style={styles.err}>checkError: {checkError.message}</Text> : null}
      {downloadError ? <Text style={styles.err}>downloadError: {downloadError.message}</Text> : null}

      <Button title="Kiểm tra update" onPress={async () => {
        try { const r = await Updates.checkForUpdateAsync(); append(`check → available=${r.isAvailable}`); }
        catch (e) { append(`check LỖI: ${String(e)}`); }
      }} />
      <Button title="Tải update" onPress={async () => {
        try { const r = await Updates.fetchUpdateAsync(); append(`fetch → new=${r.isNew}`); }
        catch (e) { append(`fetch LỖI: ${String(e)}`); }
      }} />
      <Button title="Restart để áp dụng" onPress={() => Updates.reloadAsync()} />

      {log.map((line, i) => <Text key={i} style={styles.log}>{line}</Text>)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingTop: 60, gap: 6 },
  banner: { padding: 24, borderRadius: 12, marginBottom: 12 },
  bannerText: { color: 'white', fontSize: 28, fontWeight: '700', textAlign: 'center' },
  row: { fontSize: 13 },
  err: { fontSize: 13, color: '#b91c1c' },
  log: { fontSize: 11, color: '#555' },
});
