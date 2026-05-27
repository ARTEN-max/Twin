import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import TwinLogo from './TwinLogo';
import { theme } from '../theme';

const MIN_VISIBLE_MS = 1400;
const EXIT_MS = 520;

interface AnimatedSplashProps {
  /** When false, plays exit animation then unmounts. */
  active: boolean;
}

/**
 * Branded launch overlay: logo breathe-in, soft gold pulse, staggered dots.
 * Fades out smoothly when `active` becomes false (min display time on first show).
 */
export default function AnimatedSplash({ active }: AnimatedSplashProps) {
  const [mounted, setMounted] = useState(active);
  const minTimeDone = useRef(false);
  const mountTime = useRef(Date.now());

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.88)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const glowScale = useRef(new Animated.Value(0.6)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const dot1 = useRef(new Animated.Value(0.25)).current;
  const dot2 = useRef(new Animated.Value(0.25)).current;
  const dot3 = useRef(new Animated.Value(0.25)).current;

  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);
  const dotsLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (!active) return;

    setMounted(true);
    mountTime.current = Date.now();
    minTimeDone.current = false;

    overlayOpacity.setValue(0);
    logoScale.setValue(0.88);
    logoOpacity.setValue(0);
    glowScale.setValue(0.6);
    glowOpacity.setValue(0);
    taglineOpacity.setValue(0);

    const entrance = Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 7,
        tension: 55,
        useNativeDriver: true,
      }),
      Animated.timing(glowOpacity, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(taglineOpacity, {
        toValue: 1,
        duration: 600,
        delay: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    entrance.start(() => {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(glowScale, {
              toValue: 1.12,
              duration: 2200,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(logoScale, {
              toValue: 1.04,
              duration: 2200,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(glowScale, {
              toValue: 0.92,
              duration: 2200,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(logoScale, {
              toValue: 1,
              duration: 2200,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ]),
        ])
      );
      pulseLoop.current.start();

      const dotPulse = (dot: Animated.Value, delay: number) =>
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 380,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.28,
            duration: 380,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
        ]);

      dotsLoop.current = Animated.loop(
        Animated.parallel([dotPulse(dot1, 0), dotPulse(dot2, 160), dotPulse(dot3, 320)])
      );
      dotsLoop.current.start();
    });

    const minTimer = setTimeout(() => {
      minTimeDone.current = true;
    }, MIN_VISIBLE_MS);

    return () => {
      clearTimeout(minTimer);
      pulseLoop.current?.stop();
      dotsLoop.current?.stop();
    };
  }, [
    active,
    overlayOpacity,
    logoScale,
    logoOpacity,
    glowOpacity,
    glowScale,
    taglineOpacity,
    dot1,
    dot2,
    dot3,
  ]);

  useEffect(() => {
    if (active || !mounted) return;

    const tryExit = () => {
      const elapsed = Date.now() - mountTime.current;
      const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);

      const runExit = () => {
        pulseLoop.current?.stop();
        dotsLoop.current?.stop();

        Animated.parallel([
          Animated.timing(overlayOpacity, {
            toValue: 0,
            duration: EXIT_MS,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(logoScale, {
            toValue: 1.06,
            duration: EXIT_MS,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(logoOpacity, {
            toValue: 0,
            duration: EXIT_MS * 0.85,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start(() => setMounted(false));
      };

      if (minTimeDone.current) {
        runExit();
      } else {
        setTimeout(runExit, wait);
      }
    };

    tryExit();
  }, [active, mounted, overlayOpacity, logoScale, logoOpacity]);

  if (!mounted) return null;

  return (
    <Animated.View
      style={[styles.overlay, { opacity: overlayOpacity }]}
      pointerEvents={active ? 'auto' : 'none'}
    >
      <View style={styles.center}>
        <Animated.View
          style={[
            styles.glow,
            {
              opacity: glowOpacity,
              transform: [{ scale: glowScale }],
            },
          ]}
        />
        <Animated.View
          style={{
            opacity: logoOpacity,
            transform: [{ scale: logoScale }],
          }}
        >
          <TwinLogo size={132} />
        </Animated.View>
        <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>Twin</Animated.Text>
        <View style={styles.dots}>
          <Animated.View style={[styles.dot, { opacity: dot1 }]} />
          <Animated.View style={[styles.dot, { opacity: dot2 }]} />
          <Animated.View style={[styles.dot, { opacity: dot3 }]} />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.bg,
    zIndex: 1000,
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: theme.accentGlow,
  },
  tagline: {
    marginTop: 20,
    fontSize: 15,
    letterSpacing: 6,
    textTransform: 'uppercase',
    color: theme.textSecondary,
    fontWeight: '500',
  },
  dots: {
    flexDirection: 'row',
    marginTop: 28,
    gap: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.accent,
  },
});
