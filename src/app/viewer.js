import { ModelViewer } from "../viewer.js";

export function createViewer(review) {
  review.viewer = new ModelViewer(review.$("#viewer"), {
    onReady: async (data) => {
      await review.api("ready", { ...review.owner(), ...data });
      review.loadedReceipt = data;
    },
    onEdit: review.beginEdit,
    onPin: review.onPin,
    onPaint: review.onPaint,
    onStrokeEnd: () => {
      clearTimeout(review.saveTimer);
      review.flushDraft().catch((e) => review.toast(e.message));
    },
    onError: review.toast,
  });
}
