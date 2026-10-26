import Constants from 'expo-constants';
import { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type LatLng } from 'react-native-maps';
import { mapColors } from '@solotrav/ui-tokens';
import { Notice, Text } from '@/ui/kit';

export interface MapPin { id: string; lat: number; lng: number; kind: 'planned' | 'completed' | 'saved' | 'destination'; title: string; label?: string; onPress?: () => void }

const COLOR = { planned: mapColors.planned, completed: mapColors.completed, saved: mapColors.saved, destination: mapColors.destination } as const;
const mapsConfigured = Boolean((Constants.expoConfig?.extra as { mapsConfigured?: boolean } | undefined)?.mapsConfigured);

/** Real Google Map on Android. Without a Maps SDK key the map would render blank, so say so instead. */
export function TripMap({ pins, line, route, me, height = 280, onReady }: {
  pins: MapPin[]; line?: LatLng[]; route?: LatLng[]; me?: LatLng | null; height?: number; onReady?: (fit: (pts: LatLng[]) => void) => void;
}) {
  const ref = useRef<MapView>(null);
  const pts = useMemo(() => [...pins.map((p) => ({ latitude: p.lat, longitude: p.lng })), ...(me ? [me] : [])], [pins, me]);

  useEffect(() => { if (pts.length) ref.current?.fitToCoordinates(pts, { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 }, animated: false }); }, [pts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mapsConfigured) {
    return <View style={{ height: Math.min(height, 200), justifyContent: 'center' }}><Notice tone="warn"><Text weight="bold">Google Maps is not configured</Text><Text size="sm">Build the app with GOOGLE_MAPS_ANDROID_KEY set (see docs/ANDROID.md).</Text></Notice></View>;
  }
  return (
    <View style={{ height, borderRadius: 16, overflow: 'hidden' }}>
      <MapView ref={ref} provider={PROVIDER_GOOGLE} style={{ flex: 1 }} showsUserLocation={Boolean(me)} toolbarEnabled={false} onMapReady={() => onReady?.((c) => ref.current?.fitToCoordinates(c, { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 }, animated: true }))}
        initialRegion={{ latitude: 23.8, longitude: 90.4, latitudeDelta: 6, longitudeDelta: 6 }}>
        {pins.map((p) => <Marker key={p.id} coordinate={{ latitude: p.lat, longitude: p.lng }} title={p.title} pinColor={COLOR[p.kind]} onPress={p.onPress} accessibilityLabel={p.title} />)}
        {line && line.length > 1 ? <Polyline coordinates={line} strokeColor={mapColors.planned} strokeWidth={3} lineDashPattern={[8, 8]} /> : null}
        {route && route.length > 1 ? <Polyline coordinates={route} strokeColor={mapColors.route} strokeWidth={5} /> : null}
      </MapView>
    </View>
  );
}
