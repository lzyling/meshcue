export default {
  "review.loadingModel": "Chargement du modèle",
  "review.earlierVersion": "Version antérieure · marquage toujours possible",
  "review.openElsewhere": "Une autre fenêtre a cette version ouverte",
  "review.current": "Version actuelle · prête à marquer",
  "review.notInReview":
    "Cette version ne fait pas partie de la revue en cours.",
  "review.notMarked": "Rien n'est encore marqué sur cette version.",
  "review.roundClosed":
    "Ce tour est clos ; marquer de nouveau en ouvre un autre.",

  "version.showingNow": "Affichée en ce moment",
  "version.earlier": "Version antérieure",
  "version.submitted": "{count} envoyés",
  "version.openElsewhere": "Ouverte dans une autre fenêtre",
  "version.driftStopped":
    "Une autre version est arrivée ; votre brouillon est conservé et le passage automatique s'est arrêté.",

  "resume.text": "Une autre fenêtre a aussi cette version ouverte.",
  "resume.action": "Continuer à marquer sur cette machine",
  "resume.picked": "Brouillon existant repris.",

  "recovery.text":
    "Un brouillon non synchronisé sur cette machine a été conservé ; la version actuelle n'a pas été écrasée.",
  "recovery.download": "Télécharger la sauvegarde du brouillon",
  "recovery.restored": "Le brouillon non synchronisé a été restauré.",
  "recovery.backedUp":
    "Le brouillon non synchronisé a été sauvegardé à part et peut être téléchargé pour l'Agent ; vous voyez maintenant la version enregistrée par le serveur.",
  "recovery.backedUp.named":
    "Le brouillon non synchronisé a été sauvegardé à part et peut être téléchargé pour {agent} ; vous voyez maintenant la version enregistrée par le serveur.",
  "recovery.paused":
    "Le stockage local est plein. Le brouillon non synchronisé est protégé et l'édition est en pause ; téléchargez la sauvegarde pour l'Agent.",
  "recovery.paused.named":
    "Le stockage local est plein. Le brouillon non synchronisé est protégé et l'édition est en pause ; téléchargez la sauvegarde pour {agent}.",

  "echo.summary": "L'Agent comprend : {summary}",
  "echo.summary.named": "{agent} comprend : {summary}",
  "echo.recall": "Revoir ce que l'Agent a compris",
  "echo.recall.named": "Revoir ce qu'a compris {agent}",
  "echo.dismiss": "Replier",
  "echo.stale":
    "Les marques ont changé — corrigez la compréhension dans la conversation d'origine",

  "outbox.reason": "Raison : {message}",
  "outbox.reasonUnknown": "Raison inconnue",
  "outbox.stuck":
    "{count} lots ne sont toujours pas parvenus à l'Agent ({attempts} tentatives, toujours en cours). {reason}. Les marques sont enregistrées sur cette machine — signalez-le dans la conversation d'origine.",
  "outbox.stuck.named":
    "{count} lots ne sont toujours pas parvenus à {agent} ({attempts} tentatives, toujours en cours). {reason}. Les marques sont enregistrées sur cette machine — signalez-le dans la conversation d'origine.",
  "outbox.retrying":
    "{count} lots ne sont pas encore parvenus à l'Agent ; nouvelle tentative (tentative {attempts}). {reason}. Les marques sont enregistrées — inutile de recommencer.",
  "outbox.retrying.named":
    "{count} lots ne sont pas encore parvenus à {agent} ; nouvelle tentative (tentative {attempts}). {reason}. Les marques sont enregistrées — inutile de recommencer.",

  "feedback.default":
    "Les marques emportent leur position 3D et la version actuelle",
  "feedback.notSubmitted": "Non envoyé · le brouillon s'enregistre tout seul",
  "feedback.sentCount": "Marques envoyées : {count}",
  "feedback.delivered": "remis à la conversation d'origine",
  "feedback.acceptedPending": "accepté, remise pas encore confirmée",
  "feedback.deliveryUnconfirmed": "remise non confirmée, nouvel essai prévu",
  "feedback.read": "l'Agent l'a lu",
  "feedback.read.named": "{agent} l'a lu",
  "feedback.unread": "en attente de lecture par l'Agent",
  "feedback.unread.named": "en attente de lecture par {agent}",
  "feedback.alsoUnsubmitted":
    "; d'autres changements ne sont pas encore envoyés",
  "feedback.submit": "Envoyer à l'Agent",
  "feedback.submit.named": "Envoyer à {agent}",
  "feedback.submitting": "Envoi…",
  "feedback.submitted":
    "Marques enregistrées ; l'état d'envoi suit l'accusé de réception réel. Vous pouvez continuer à annoter cette version.",

  "receipt.next":
    "Ce que l'Agent a compris s'affichera en bas à droite du modèle",
  "receipt.next.named":
    "Ce qu'a compris {agent} s'affichera en bas à droite du modèle",
  "receipt.understood":
    "Ce que l'Agent a compris est arrivé à {time}, en bas à droite du modèle",
  "receipt.understood.named":
    "Ce qu'a compris {agent} est arrivé à {time}, en bas à droite du modèle",
  "receipt.nudge":
    "L'Agent n'est pas prévenu automatiquement. Dites-le-lui dans sa conversation — vous pouvez coller cette phrase :",
  "receipt.nudge.named":
    "{agent} n'est pas prévenu automatiquement. Dites-le dans sa conversation — vous pouvez coller cette phrase :",
  "receipt.line":
    "J'ai envoyé mes marques MeshCue ({count}). Lis-les avec meshcue read — project {project}, submissionId {submission}",
  "receipt.lineNoProject":
    "J'ai envoyé mes marques MeshCue ({count}). Lis-les avec meshcue read — submissionId {submission}",
  "receipt.copy": "Copier",
  "receipt.copied": "Copié",
  "receipt.copyTitle": "Copier cette phrase",
  "receipt.copyFailed":
    "Copie impossible : la phrase est sélectionnée, copiez-la vous-même",
  "receipt.listJoin": ", ",
  "receipt.chatSent":
    "📐 Marques reçues : {count} ({marks}). Transmises à l'Agent, lecture en cours…",
  "receipt.chatSent.named":
    "📐 Marques reçues : {count} ({marks}). Transmises à {agent}, lecture en cours…",
  "receipt.chatRead":
    "📐 Marques reçues : {count} ({marks}). L'Agent les a lues et cherche ce que vous vouliez dire…",
  "receipt.chatRead.named":
    "📐 Marques reçues : {count} ({marks}). {agent} les a lues et cherche ce que vous vouliez dire…",
};
