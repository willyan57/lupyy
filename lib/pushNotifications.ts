/**
 * Push Notifications Helper
 * Caminho: lib/pushNotifications.ts
 */

import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  } as Notifications.NotificationBehavior),
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('Push notifications só funcionam em dispositivos físicos');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Permissão de notificação negada');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Padrão',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF6B6B',
    });
  }

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId
      ?? Constants.easConfig?.projectId;

    if (!projectId) {
      console.error('projectId não encontrado');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoPushToken = tokenData.data;

    console.log('Expo Push Token:', expoPushToken);
    await saveTokenToSupabase(expoPushToken);

    return expoPushToken;
  } catch (error) {
    console.error('Erro ao registrar push:', error);
    return null;
  }
}

async function saveTokenToSupabase(expoPushToken: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      {
        user_id: user.id,
        expo_push_token: expoPushToken,
        device_name: Device.deviceName ?? 'Unknown',
        platform: Platform.OS as 'ios' | 'android' | 'web',
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,expo_push_token' }
    );

  if (error) {
    console.error('Erro ao salvar push token:', error.message);
  } else {
    console.log('Push token salvo com sucesso!');
  }
}

export async function unregisterPushToken(): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const tokenData = await Notifications.getExpoPushTokenAsync();

    await supabase
      .from('push_tokens')
      .update({ is_active: false })
      .eq('user_id', user.id)
      .eq('expo_push_token', tokenData.data);

    console.log('Push token desativado');
  } catch (error) {
    console.error('Erro ao desativar push token:', error);
  }
}

export function setupNotificationListeners(
  onNotificationReceived?: (notification: Notifications.Notification) => void,
  onNotificationResponse?: (response: Notifications.NotificationResponse) => void,
): () => void {
  const receivedSubscription = Notifications.addNotificationReceivedListener(
    (notification: Notifications.Notification) => {
      console.log('Notificação recebida:', notification.request.content);
      onNotificationReceived?.(notification);
    }
  );

  const responseSubscription = Notifications.addNotificationResponseReceivedListener(
    (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data;
      console.log('Usuário tocou na notificação:', data);
      onNotificationResponse?.(response);
    }
  );

  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
  };
}
