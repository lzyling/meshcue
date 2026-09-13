/* Français. Les noms d'outils restent courts parce qu'ils se suivent dans une
   barre : « Gomme », pas « Outil gomme ». */
export default {
  "app.tagline": "Revue et annotation de modèles 3D",
  "app.preview": "Aperçu {version}",

  "common.close": "Fermer",
  "common.version": "Version",

  "conn.connecting": "Connexion",
  "conn.origin": "Répond dans la conversation d'origine",
  "conn.local": "Revue locale",
  "conn.returnToChat": "Revenir à la conversation d'origine",
  "conn.paused": "Connexion en pause",
  "conn.accessExpired": "Accès expiré · brouillon conservé",
  "conn.noAccess": "Pas encore d'accès à la revue",
  "conn.offline": "Le service est hors ligne",
  "conn.connectedNoAccess":
    "Connecté à l'atelier ; aucun modèle ne sera chargé avant l'octroi de l'accès.",
  "conn.dropped":
    "La connexion au service a été perdue ; votre brouillon est conservé.",
  "conn.actionFailed": "L'action n'a pas abouti.",
  "conn.noSecureRandom":
    "Ce navigateur n'a pas de source aléatoire sécurisée. Veuillez utiliser une version récente de Chrome ou d'Edge.",

  "error.accessRequired":
    "Cette entrée n'a pas d'accès de revue valide. Veuillez revenir à la conversation d'origine.",

  "a11y.reviewPanel": "Revue du modèle",
  "a11y.versionTabs": "Versions du modèle",
  "a11y.toolbar": "Outils du modèle",
  "a11y.palette": "Couleur de marquage",
  "a11y.viewer": "Aperçu du modèle 3D — pivoter, zoomer et annoter",

  "model.awaiting": "En attente du modèle livré par l'Agent",
  "model.awaitingFirst": "En attente du premier modèle livré par l'Agent",
  "model.triangles": "{count} triangles",
  "model.summary": "{count} triangles · {format} · {units}",
  "model.readFailed": "Impossible de lire le fichier du modèle.",
  "model.versionMismatch":
    "Le fichier ne correspond pas à la version indiquée par l'Agent ; marquage interrompu.",
  "model.noExtent": "Le modèle n'a aucune étendue affichable.",
  "model.animated":
    "Exportez d'abord un maillage statique ; cette version n'annote pas les animations déformantes.",
  "model.tooManyTriangles":
    "Le modèle dépasse 600 000 triangles. Simplifiez-le d'abord.",
  "model.meshOverBudget":
    "Le maillage de revue dépasse la limite de 600 000 triangles. Simplifiez d'abord le modèle.",
  "model.contextLost":
    "Le contexte d'affichage a été perdu ; votre brouillon est conservé. Veuillez recharger la page.",

  "save.preparing": "Préparation",
  "save.saving": "Enregistrement…",
  "save.saved": "Brouillon enregistré",
  "save.verifying": "Vérification…",
  "save.restoring": "Restauration du brouillon…",
  "save.notStarted": "Aucun marquage",
  "save.unsynced": "Non synchronisé · brouillon sur cette machine",
  "save.storageFull":
    "Le stockage local est plein. Laissez cette page ouverte pour que le serveur puisse enregistrer.",

  "loading.preparing": "Préparation de l'espace de revue",
  "loading.verifying": "Chargement et vérification de la version du modèle",
  "loading.rebuildingMesh": "Recalcul du maillage de revue ({count} triangles)",
  "loading.hint":
    "Vous pourrez commencer à marquer dès que le modèle sera chargé",

  "review.loadingModel": "Chargement du modèle",
  "review.earlierVersion": "Version antérieure · marquage toujours possible",
  "review.openElsewhere": "Une autre fenêtre a cette version ouverte",
  "review.current": "Version actuelle · prête à marquer",
  "review.notInReview":
    "Cette version ne fait pas partie de la revue en cours.",
  "review.notMarked": "Rien n'est encore marqué sur cette version.",
  "review.roundClosed":
    "Ce tour est clos ; marquer de nouveau en ouvre un autre.",

  "marks.heading": "Marques de ce tour",
  "marks.collapse": "Replier la liste",
  "marks.expand": "Déplier la liste",
  "marks.empty": "Marquez sur le modèle\nles endroits à modifier.",
  "marks.limit": "Un tour contient au plus 200 marques.",
  "marks.nearStrokeLimit":
    "Ce tour approche sa limite de tracés. Envoyez d'abord ce lot.",
  "marks.nearMarkLimit":
    "Ce tour approche sa limite de marques. Envoyez d'abord ce lot.",
  "marks.pin": "Repère",
  "marks.regionName": "Zone {color}",
  "marks.pinned": "Fixé à la surface",
  "marks.alongSurface": "Marqué le long de la surface",
  "marks.legacyFace": "Ancienne marque pleine face · conservée telle quelle",
  "marks.one": "Marque {label}",
  "marks.showOne": "Afficher {name}",
  "marks.hideOne": "Masquer {name}",
  "marks.deleteLabel": "Supprimer le repère {label}",
  "marks.deleteOne": "Supprimer {name}",
  "marks.frame": "Cadrer",
  "marks.frameOne": "Cadrer {name}",
  "marks.move": "Déplacer",
  "marks.moveLabel": "Déplacer le repère {label}",
  "marks.moveHint":
    "Cliquez sur la surface pour déplacer {label} ; Échap annule.",
  "marks.hide": "Masquer les marques",
  "marks.show": "Afficher les marques",

  "color.red": "rouge",
  "color.yellow": "jaune",
  "color.green": "verte",
  "color.blue": "bleue",
  "color.purple": "violette",
  "color.choose": "Choisir la couleur {color}",

  "view.plain": "Vue neutre",
  "view.original": "Couleurs d'origine",

  "cube.front": "AVANT",
  "cube.back": "ARRIÈRE",
  "cube.right": "DROITE",
  "cube.left": "GAUCHE",
  "cube.top": "DESSUS",
  "cube.bottom": "DESSOUS",
  "cube.viewFrom": "Vue depuis {side}",
  "cube.sideJoin": "-",
  "cube.homeTitle": "Revenir à la vue par défaut",
  "cube.homeLabel": "Réinitialiser la vue",

  "tool.orbit": "Pivoter / Repère",
  "tool.orbitLabel": "Pivoter et repérer",
  "tool.orbitTitle":
    "Double-cliquez une surface pour poser un repère ; le bouton droit pivote",
  "tool.brush": "Pinceau",
  "tool.brushLabel": "Outil pinceau",
  "tool.brushTitle": "Le pinceau ne marque que la surface visible",
  "tool.eraser": "Gomme",
  "tool.eraserLabel": "Outil gomme",
  "tool.eraserTitle": "N'efface que les marques",
  "tool.bucket": "Remplir",
  "tool.bucketLabel": "Outil pot de peinture",
  "tool.bucketTitle":
    "Prévisualise la zone contiguë quasi plane ; un clic la remplit",
  "tool.undo": "Annuler",
  "tool.undoTitle": "Annuler Ctrl/⌘ Z",
  "tool.redo": "Rétablir",
  "tool.size": "Taille",
  "tool.brushSize": "Taille du pinceau",
  "tool.spread": "Étendue",
  "tool.bucketSpread": "Étendue du remplissage",
  "tool.newRegion": "Nouvelle zone",
  "tool.newRegionHint": "Le prochain tracé formera sa propre zone de couleur.",
  "tool.eraseTooFine":
    "L'effacement a produit trop de petits fragments. Utilisez une zone plus petite.",
  "tool.strokeTooBroad":
    "Ce tracé touche trop de surfaces. Zoomez ou réduisez le pinceau ; les tracés existants sont conservés.",
  "tool.faceOverLimit":
    "Cette surface dépasse la limite de 20 000 triangles par marque ; réduisez l'étendue ou simplifiez le modèle.",

  "hint.orbit":
    "Glisser à droite pour pivoter · double-clic pour repérer · deux doigts ou milieu pour déplacer · molette pour zoomer",
  "hint.paint": "Peindre la surface visible · le bouton droit pivote toujours",
  "hint.erase":
    "Effacer les tracés visibles · le modèle reste intact · le bouton droit pivote toujours",
  "hint.fill":
    "Survoler pour prévisualiser · cliquer pour remplir · le bouton droit pivote toujours",
  "hint.relocate": "Cliquez une surface pour déplacer le repère · Échap annule",

  "version.showingNow": "Affichée en ce moment",
  "version.earlier": "Version antérieure",
  "version.submitted": "{count} envoyés",
  "version.openElsewhere": "Ouverte dans une autre fenêtre",
  "version.pinnedNotice":
    "Vous regardez une version antérieure ; la plus récente est {version}.",
  "version.goLatest": "Afficher la dernière version",
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
  "recovery.paused":
    "Le stockage local est plein. Le brouillon non synchronisé est protégé et l'édition est en pause ; téléchargez la sauvegarde pour l'Agent.",

  "echo.summary": "L'Agent comprend : {summary}",
  "echo.recall": "Revoir ce que l'Agent a compris",
  "echo.dismiss": "Replier",
  "echo.stale":
    "Les marques ont changé — corrigez la compréhension dans la conversation d'origine",

  "precision.overBudget":
    "Ce modèle a épuisé le budget du maillage de revue (il demande {wanted} triangles, le budget est de {budget}). Les grandes surfaces planes cessent d'être subdivisées, le pinceau y avance par blocs entiers ; les détails ne sont pas affectés. Pour des tracés plus fins, demandez à l'Agent de réexporter avec une hauteur de corde plus faible.",

  "outbox.reason": "Raison : {message}",
  "outbox.reasonUnknown": "Raison inconnue",
  "outbox.stuck":
    "{count} lots ne sont toujours pas parvenus à l'Agent ({attempts} tentatives, toujours en cours). {reason}. Les marques sont enregistrées sur cette machine — signalez-le dans la conversation d'origine.",
  "outbox.retrying":
    "{count} lots ne sont pas encore parvenus à l'Agent ; nouvelle tentative (tentative {attempts}). {reason}. Les marques sont enregistrées — inutile de recommencer.",

  "feedback.default":
    "Les marques emportent leur position 3D et la version actuelle",
  "feedback.notSubmitted": "Non envoyé · le brouillon s'enregistre tout seul",
  "feedback.saved": "Enregistré",
  "feedback.delivered": "remis à la conversation d'origine",
  "feedback.acceptedPending": "accepté, remise pas encore confirmée",
  "feedback.deliveryUnconfirmed": "remise non confirmée, nouvel essai prévu",
  "feedback.read": "l'Agent l'a lu",
  "feedback.unread": "en attente de lecture par l'Agent",
  "feedback.alsoUnsubmitted":
    "; d'autres changements ne sont pas encore envoyés",
  "feedback.submit": "Envoyer à l'Agent",
  "feedback.submitting": "Envoi…",
  "feedback.submitted":
    "Marques enregistrées ; l'état d'envoi suit l'accusé de réception réel. Le modèle reste verrouillé.",

  "settings.device": "Dispositif de pointage",
  "settings.deviceAuto": "Détecter automatiquement",
  "settings.deviceMouse": "Souris",
  "settings.deviceTrackpad": "Pavé tactile",
  "settings.language": "Langue de l'interface",
  "settings.theme": "Clair ou sombre",
  "settings.themeSystem": "Suivre le système",
  "settings.themeLight": "Clair",
  "settings.themeDark": "Sombre",

  "help.open": "Mode d'emploi",
  "help.eyebrow": "DÉMARRAGE RAPIDE",
  "help.title": "Regarder, marquer, puis dire ce qu'il faut changer.",
  "help.p1":
    "Glisser avec le bouton droit pour pivoter, bouton du milieu ou deux doigts pour déplacer, molette ou pincement pour zoomer. Le bouton gauche n'est jamais à la caméra : marquez sans changer d'outil.",
  "help.p2":
    "Repères : double-cliquez la surface pour poser A, B, C ; un simple clic ne pose rien. Pinceau : ne peint que la surface visible — et le bouton droit continue de pivoter, la peinture n'a jamais à s'interrompre pour tourner le modèle.",
  "help.p3":
    "Les repères se reconnaissent à leur lettre, les zones peintes à leur couleur ; la couleur ne couvre que les tracés réels. Pour séparer une autre demande, appuyez sur « Nouvelle zone ». Les marques peuvent être annulées, rétablies et supprimées une à une.",
  "help.p4":
    "La gomme n'enlève que les tracés visibles et laisse intacts les matériaux du modèle. Le pot de peinture prévisualise la zone contiguë quasi plane et la remplit d'un clic ; le curseur d'étendue n'apparaît que pour lui. Le remplissage agit sur toute une surface contiguë, y compris des parties cachées derrière d'autres objets ; le pinceau et la gomme ne traversent pas.",
  "help.p5":
    "Les marques se distinguent par leur motif et se masquent d'une pression ; la vue neutre n'est qu'une aide visuelle. Les marques n'existent que dans la revue — le fichier du modèle que détient l'Agent ne les porte jamais.",
  "help.p6":
    "« Envoyer à l'Agent » enregistre et transmet les marques. Revenez à la conversation d'origine pour dire ce que vous voulez changer ; l'Agent posera des questions si besoin. L'envoi seul ne modifie pas le modèle.",
  "help.p7":
    "Les onglets en haut listent chaque version livrée par l'Agent. Appuyez sur l'un d'eux pour la revoir, et vous pouvez marquer et envoyer directement sur une version ancienne — chaque version garde son propre brouillon, et changer d'onglet n'affecte pas les autres. Les marques reçues par l'Agent indiquent la version visée.",
  "help.p8":
    "« Envoyer à l'Agent » envoie ce lot ; l'Agent répond par une nouvelle version sur laquelle vous continuez à marquer. Rien n'a besoin d'être clos, et les brouillons s'enregistrent seuls.",
  "help.p9":
    "Première version : GLB/STL, jusqu'à 80 Mo et 600 000 triangles. Animation, squelettes et GLB compressé ne sont pas encore pris en charge. C'est un outil de revue ; il ne sculpte pas le modèle.",
};
