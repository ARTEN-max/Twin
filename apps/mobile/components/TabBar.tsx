/**
 * TabBar — premium bottom navigation with custom View-based icons
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../theme';

export type Tab = 'Today' | 'Chat';

interface TabBarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

// ─── Icons ────────────────────────────────────────────────────

function WaveformIcon({ color }: { color: string }) {
  const bars = [9, 16, 11, 20, 13, 18, 8, 15, 10];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2.5, height: 22 }}>
      {bars.map((h, i) => (
        <View
          key={i}
          style={{
            width: 2.5,
            height: h,
            borderRadius: 1.5,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}

function ChatBubbleIcon({ color }: { color: string }) {
  return (
    <View style={{ width: 26, height: 24 }}>
      {/* Main bubble body */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 20,
          borderRadius: 8,
          borderBottomLeftRadius: 3,
          backgroundColor: color,
        }}
      />
      {/* Tail triangle using border trick */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 1,
          width: 0,
          height: 0,
          borderStyle: 'solid',
          borderLeftWidth: 7,
          borderTopWidth: 7,
          borderLeftColor: 'transparent',
          borderTopColor: color,
        }}
      />
    </View>
  );
}

// ─── TabBar ───────────────────────────────────────────────────

export default function TabBar({ activeTab, onTabChange }: TabBarProps) {
  const activeColor = theme.accent;
  const inactiveColor = theme.textMuted;

  return (
    <View style={styles.container}>
      {/* Thin top rule */}
      <View style={styles.topRule} />

      <TouchableOpacity style={styles.tab} onPress={() => onTabChange('Today')} activeOpacity={0.7}>
        {/* Active indicator pill */}
        {activeTab === 'Today' && <View style={styles.activePill} />}

        <WaveformIcon color={activeTab === 'Today' ? activeColor : inactiveColor} />
        <Text
          style={[styles.tabLabel, { color: activeTab === 'Today' ? activeColor : inactiveColor }]}
        >
          Today
        </Text>
      </TouchableOpacity>

      {/* Center divider */}
      <View style={styles.divider} />

      <TouchableOpacity style={styles.tab} onPress={() => onTabChange('Chat')} activeOpacity={0.7}>
        {activeTab === 'Chat' && <View style={styles.activePill} />}

        <ChatBubbleIcon color={activeTab === 'Chat' ? activeColor : inactiveColor} />
        <Text
          style={[styles.tabLabel, { color: activeTab === 'Chat' ? activeColor : inactiveColor }]}
        >
          Chat
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: theme.surface,
    paddingBottom: 28,
    paddingTop: 4,
    position: 'relative',
  },
  topRule: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: theme.border,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
    position: 'relative',
  },
  activePill: {
    position: 'absolute',
    top: 0,
    left: '25%',
    right: '25%',
    height: 2,
    borderRadius: 1,
    backgroundColor: theme.accent,
  },
  tabLabel: {
    fontFamily: theme.fontMono,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  divider: {
    width: 1,
    marginVertical: 14,
    backgroundColor: theme.border,
  },
});
