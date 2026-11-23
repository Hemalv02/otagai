import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { assistantApi } from "@/lib/assistant-api";

const recordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

export function useAssistantVoice(
  onTranscript: (text: string) => void,
  onError: (
    reason: "denied" | "unavailable" | "failed" | "inaudible",
    error?: unknown,
  ) => void,
) {
  const recorder = useAudioRecorder(recordingOptions);
  const meter = useAudioRecorderState(recorder, 160);
  const [status, setStatus] = useState<
    "idle" | "starting" | "recording" | "transcribing"
  >("idle");
  const current = useRef(status);
  const focused = useRef(false);
  const peak = useRef<number | null>(null);

  useEffect(() => {
    if (
      status === "recording" &&
      meter.isRecording &&
      typeof meter.metering === "number"
    ) {
      peak.current = Math.max(peak.current ?? -Infinity, meter.metering);
    }
  }, [meter.isRecording, meter.metering, status]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
        if (current.current === "recording") {
          current.current = "idle";
          setStatus("idle");
          void recorder
            .stop()
            .then(() => setAudioModeAsync({ allowsRecording: false }))
            .catch(() =>
              console.warn("Otagai could not stop the audio recorder."),
            );
        }
      };
    }, [recorder]),
  );

  function change(next: typeof status) {
    current.current = next;
    setStatus(next);
  }

  async function start() {
    if (current.current !== "idle") return;
    if (Platform.OS === "web") {
      onError("unavailable");
      return;
    }
    change("starting");
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!focused.current) {
        change("idle");
        return;
      }
      if (!permission.granted) {
        onError("denied");
        change("idle");
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      if (!focused.current) {
        await setAudioModeAsync({ allowsRecording: false });
        change("idle");
        return;
      }
      peak.current = null;
      recorder.record();
      change("recording");
    } catch (error) {
      change("idle");
      onError("failed", error);
    }
  }

  async function stop(discard = false) {
    if (current.current !== "recording") return;
    change("transcribing");
    try {
      const duration = recorder.getStatus().durationMillis;
      const level = peak.current;
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      if (discard) return;
      if (duration < 500 || (level !== null && level < -60)) {
        onError("inaudible");
        return;
      }
      if (!recorder.uri) throw new Error("Missing recording");
      const media = await assistantApi.upload("voice", {
        uri: recorder.uri,
      });
      const { text } = await assistantApi.transcribe(media.id);
      if (!text.trim()) throw new Error("Empty recording");
      onTranscript(text.trim());
    } catch (error) {
      onError("failed", error);
    } finally {
      change("idle");
    }
  }

  return { status, start, stop };
}
