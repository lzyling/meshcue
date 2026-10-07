export default {
  "review.loadingModel": "Loading model",
  "review.openElsewhere": "Another window has this version open",
  "review.notInReview": "This version is not part of the current review.",
  "review.notMarked": "Nothing marked on this version yet.",
  "review.roundClosed": "This round is closed; marking again starts a new one.",

  "version.showingNow": "Showing now",
  "version.earlier": "Earlier version",
  "version.submitted": "{count} submitted",
  "version.openElsewhere": "Open in another window",
  "version.driftStopped":
    "A different version arrived; your draft is kept and automatic switching has stopped.",

  "resume.text": "Another window has this version open too.",
  "resume.action": "Continue marking on this machine",
  "resume.picked": "Picked up the existing draft.",

  "recovery.text":
    "An unsynced draft on this machine was kept; the current version was not overwritten.",
  "recovery.download": "Download the draft backup",
  "recovery.restored": "Restored the draft that had not synced.",
  "recovery.backedUp":
    "The unsynced draft was backed up separately and can be downloaded for the Agent; you are now seeing the version the server saved.",
  "recovery.backedUp.named":
    "The unsynced draft was backed up separately and can be downloaded for {agent}; you are now seeing the version the server saved.",
  "recovery.paused":
    "Local storage is full. The unsynced draft is protected and editing is paused; download the backup for the Agent.",
  "recovery.paused.named":
    "Local storage is full. The unsynced draft is protected and editing is paused; download the backup for {agent}.",

  "echo.summary": "Agent understands: {summary}",
  "echo.summary.named": "{agent} understands: {summary}",
  "echo.recall": "Read the Agent's understanding again",
  "echo.recall.named": "Read again what {agent} understood",
  "echo.dismiss": "Put it away",
  "echo.stale":
    "The marks changed — correct the understanding in the original conversation",

  "outbox.reason": "Reason: {message}",
  "outbox.reasonUnknown": "Reason unknown",
  "outbox.stuck":
    "{count} batches still have not reached the Agent (retried {attempts} times, still trying). {reason}. The marks are saved on this machine — mention it in the original conversation.",
  "outbox.stuck.named":
    "{count} batches still have not reached {agent} (retried {attempts} times, still trying). {reason}. The marks are saved on this machine — mention it in the original conversation.",
  "outbox.retrying":
    "{count} batches have not reached the Agent yet; retrying (attempt {attempts}). {reason}. The marks are saved — there is no need to mark again.",
  "outbox.retrying.named":
    "{count} batches have not reached {agent} yet; retrying (attempt {attempts}). {reason}. The marks are saved — there is no need to mark again.",

  "feedback.default": "Marks carry their 3D position and the current version",
  "feedback.notSubmitted": "Not submitted · the draft saves itself",
  "feedback.sentCount": "Marks sent: {count}",
  "feedback.delivered": "delivered to the original conversation",
  "feedback.acceptedPending": "accepted, delivery not yet confirmed",
  "feedback.deliveryUnconfirmed": "delivery unconfirmed, will retry",
  "feedback.read": "the Agent has read it",
  "feedback.read.named": "{agent} has read it",
  "feedback.unread": "waiting for the Agent to read it",
  "feedback.unread.named": "waiting for {agent} to read it",
  "feedback.alsoUnsubmitted": "; more changes are not yet submitted",
  "feedback.submit": "Send to Agent",
  "feedback.submit.named": "Send to {agent}",
  "feedback.submitting": "Submitting…",
  "feedback.submitted":
    "Marks saved; the submission status updates from the actual receipt. You can keep marking this version.",

  "receipt.next":
    "What the Agent understood will appear at the bottom right of the model",
  "receipt.next.named":
    "What {agent} understood will appear at the bottom right of the model",
  "receipt.understood":
    "What the Agent understood arrived at {time}, at the bottom right of the model",
  "receipt.understood.named":
    "What {agent} understood arrived at {time}, at the bottom right of the model",
  "receipt.nudge":
    "The Agent is not told automatically. Say so in its conversation — you can paste this:",
  "receipt.nudge.named":
    "{agent} is not told automatically. Say so in its conversation — you can paste this:",
  "receipt.line":
    "I've sent my MeshCue marks ({count}). Please read them with meshcue read — project {project}, submissionId {submission}",
  "receipt.lineNoProject":
    "I've sent my MeshCue marks ({count}). Please read them with meshcue read — submissionId {submission}",
  "receipt.copy": "Copy",
  "receipt.copied": "Copied",
  "receipt.copyTitle": "Copy this sentence",
  "receipt.copyFailed":
    "Could not copy — the sentence is selected; copy it yourself",
  "receipt.listJoin": ", ",
  "receipt.chatSent":
    "📐 Marks received: {count} ({marks}). Handed to the Agent, reading them now…",
  "receipt.chatSent.named":
    "📐 Marks received: {count} ({marks}). Handed to {agent}, reading them now…",
  "receipt.chatRead":
    "📐 Marks received: {count} ({marks}). The Agent has read them and is working out what you meant…",
  "receipt.chatRead.named":
    "📐 Marks received: {count} ({marks}). {agent} has read them and is working out what you meant…",
};
