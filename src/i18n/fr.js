/* Français. Les noms d'outils restent courts parce qu'ils se suivent dans une
   barre : « Gomme », pas « Outil gomme ». */
export default {
  "section.title": "Coupe",
  "section.axis": "Axe du modèle",
  "section.offset": "Décalage",
  "section.flip": "Inverser le côté",
  "section.off": "Désactiver / réinitialiser",
  "section.hint":
    "La face de coupe ambrée est une aide visuelle ; elle ne peut être ni marquée ni mesurée.",
  "help.p12":
    "Coupe : couper selon l’axe X, Y ou Z du modèle, régler le décalage dans les unités du modèle ou inverser le côté retiré. La face de coupe ambrée est une aide visuelle ; elle ne peut être ni marquée ni mesurée. Les faces avant restantes peuvent toujours être marquées et mesurées. La coupe sert uniquement à la visualisation, n’est jamais envoyée à l’Agent et se réinitialise au chargement d’un autre modèle ou d’une autre version.",
  "help.p12.named":
    "Coupe : couper selon l’axe X, Y ou Z du modèle, régler le décalage dans les unités du modèle ou inverser le côté retiré. La face de coupe ambrée est une aide visuelle ; elle ne peut être ni marquée ni mesurée. Les faces avant restantes peuvent toujours être marquées et mesurées. La coupe sert uniquement à la visualisation, n’est jamais envoyée à {agent} et se réinitialise au chargement d’un autre modèle ou d’une autre version.",

  "agent.withTool": "{name} ({tool})",

  "app.tagline": "Revue et annotation de modèles 3D",
  "app.version": "Version en cours",
  "app.updateHint":
    "La version {version} est disponible. Demandez à votre agent de mettre à jour MeshCue.",
  "app.updateHint.named":
    "La version {version} est disponible. Demandez à {agent} de mettre à jour MeshCue.",

  "closing.pending":
    "Cette revue n'a pas servi depuis un moment et va se fermer. Toute action ici la maintient ouverte.",
  "closing.done":
    "Fermée après une longue inactivité. Toutes les versions et les annotations enregistrées sont conservées : demandez à l'agent de rouvrir cette revue pour continuer.",
  "closing.done.named":
    "Fermée après une longue inactivité. Toutes les versions et les annotations enregistrées sont conservées : demandez à {agent} de rouvrir cette revue pour continuer.",
  "common.close": "Fermer",
  "common.version": "Version",

  "conn.connecting": "Connexion",
  "conn.origin": "Répond dans la conversation d'origine",
  "conn.collect": "L'agent vient les chercher ici",
  "conn.collect.named": "{agent} vient les chercher ici",
  "conn.local": "Revue locale",
  "conn.returnToChat": "Revenir à la conversation d'origine",
  "conn.paused": "Connexion en pause",
  "conn.accessExpired": "Accès expiré · brouillon conservé",
  "conn.noAccess": "Pas encore d'accès à la revue",
  "conn.reclaimed": "Revue fermée · annotations enregistrées",
  "conn.offline": "Le service est hors ligne",
  "conn.connectedNoAccess":
    "Connecté à l'atelier ; aucun modèle ne sera chargé avant l'octroi de l'accès.",
  "conn.dropped":
    "La connexion au service a été perdue ; votre brouillon est conservé.",
  "conn.actionFailed": "L'action n'a pas abouti.",
  "conn.noSecureRandom":
    "Ce navigateur n'a pas de source aléatoire sécurisée. Veuillez utiliser une version récente de Chrome ou d'Edge.",

  "error.empty": "Posez d'abord un repère ou peignez une zone",
  "error.saving":
    "Attendez la fin de l'enregistrement du brouillon avant d'envoyer",
  "error.staleDraft":
    "Le brouillon a changé ; rechargez la version enregistrée",
  "error.originBusy": "Une autre conversation utilise cette revue en ce moment",
  "error.accessExpired":
    "Cette autorisation à usage unique a expiré ; revenez à la conversation",
  "error.accessLimit": "Cette revue a atteint sa limite de connexions",
  "error.integrationDisabled":
    "MeshCue est désactivé ; votre brouillon est conservé, continuez dans la conversation",
  "error.deliveryUnconfirmed":
    "Livraison non confirmée ; vos marques sont enregistrées et seront réessayées",
  "error.accessRequired":
    "Cette entrée n'a pas d'accès de revue valide. Veuillez revenir à la conversation d'origine.",

  "a11y.reviewPanel": "Revue du modèle",
  "a11y.versionTabs": "Versions du modèle",
  "a11y.toolbar": "Outils du modèle",
  "a11y.palette": "Couleur de marquage",
  "a11y.viewer": "Aperçu du modèle 3D — pivoter, zoomer et annoter",

  "model.awaiting": "En attente du modèle livré par l'Agent",
  "model.awaiting.named": "En attente du modèle livré par {agent}",
  "model.awaitingFirst": "En attente du premier modèle livré par l'Agent",
  "model.awaitingFirst.named": "En attente du premier modèle livré par {agent}",
  "model.triangles": "{count} triangles",
  "model.summary": "{count} triangles · {format} · {units}",
  "units.unspecified": "sans unité",
  "model.readFailed": "Impossible de lire le fichier du modèle.",
  "model.versionMismatch":
    "Le fichier ne correspond pas à la version indiquée par l'Agent ; marquage interrompu.",
  "model.versionMismatch.named":
    "Le fichier ne correspond pas à la version indiquée par {agent} ; marquage interrompu.",
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
    "Cette série contient autant d'annotations que le navigateur peut conserver. Envoyez ce lot ; la suivante repartira de zéro.",
  "marks.nearMarkLimit":
    "Chaque face de ce modèle est déjà marquée dans cette série.",
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
  "note.title": "Note : {name}",
  "note.placeholder":
    "Que faut-il changer ici ? Facultatif – part avec la marque vers l'Agent.",
  "note.placeholder.named":
    "Que faut-il changer ici ? Facultatif – part avec la marque vers {agent}.",

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

  "tool.orbit": "Pivoter",
  "tool.orbitLabel": "Outil pivoter",
  "tool.orbitTitle": "Tourner et examiner le modèle ; rien n'est posé ni peint",
  "tool.label": "Repère",
  "tool.labelLabel": "Outil repère",
  "tool.labelTitle":
    "Cliquez une surface pour poser un repère ; le bouton droit pivote",
  "hint.label":
    "Cliquez une surface pour poser un repère · le bouton droit pivote toujours",
  "tool.bucket": "Remplir",
  "tool.bucketLabel": "Outil pot de peinture",
  "tool.bucketTitle":
    "Prévisualise la zone contiguë quasi plane ; un clic la remplit",
  "tool.undo": "Annuler",
  "tool.undoTitle": "Annuler Ctrl/⌘ Z",
  "tool.redo": "Rétablir",
  "tool.marks": "Marques",
  "tool.plain": "Neutre",
  "tool.spread": "Étendue",
  "tool.bucketSpread": "Étendue du remplissage",
  "tool.newRegion": "Nouvelle zone",
  "tool.newRegionHint":
    "Le prochain remplissage formera sa propre zone de couleur.",
  "hint.orbit":
    "Glisser à droite pour pivoter · deux doigts ou milieu pour déplacer · molette pour zoomer",
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
    "Marques enregistrées ; l'état d'envoi suit l'accusé de réception réel. Le modèle reste verrouillé.",

  "settings.language": "Langue de l'interface",
  "settings.theme": "Clair ou sombre",
  "settings.themeSystem": "Suivre le système",
  "settings.themeLight": "Clair",
  "settings.themeDark": "Sombre",

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

  "help.open": "Mode d'emploi",
  "help.eyebrow": "DÉMARRAGE RAPIDE",
  "help.title": "Regarder, marquer, puis dire ce qu'il faut changer.",
  "help.p1":
    "Glisser avec le bouton droit pour pivoter, molette ou pincement pour zoomer, bouton du milieu ou Maj+molette pour déplacer — identique à la souris et au pavé tactile. Le bouton gauche n'est jamais à la caméra : marquez sans changer d'outil.",
  "help.p2":
    "Repères : choisissez l'outil Repère et cliquez la surface pour poser A, B, C ; l'outil Pivoter ne pose rien, vous pouvez donc tourner le modèle sans créer de marques. Pot de peinture : un clic sur une surface marque toute la zone contiguë — et le bouton droit continue de pivoter, le marquage n'a jamais à s'interrompre pour tourner le modèle.",
  "help.p3":
    "Les repères se reconnaissent à leur lettre, les zones marquées à leur couleur. Pour séparer une autre demande, appuyez sur « Nouvelle zone ». Sélectionnez une marque dans la liste pour y écrire une note : ce qu'il faut changer à cet endroit. Les marques peuvent être annulées, rétablies et supprimées une à une.",
  "help.p4":
    "Le pot de peinture prévisualise la zone contiguë quasi plane et la remplit d'un clic ; le curseur d'étendue fixe jusqu'où cette zone peut s'étendre. Il agit sur toute une surface contiguë, y compris des parties cachées derrière d'autres objets. Pour revenir sur un remplissage, annulez-le ou supprimez la marque dans la liste.",
  "help.p5":
    "Les marques se distinguent par leur motif et se masquent d'une pression ; la vue neutre n'est qu'une aide visuelle. Les marques n'existent que dans la revue — le fichier du modèle que détient l'Agent ne les porte jamais.",
  "help.p5.named":
    "Les marques se distinguent par leur motif et se masquent d'une pression ; la vue neutre n'est qu'une aide visuelle. Les marques n'existent que dans la revue — le fichier du modèle que détient {agent} ne les porte jamais.",
  "help.p6":
    "« Envoyer à l'Agent » enregistre et transmet les marques avec leurs notes. Dites ce que vous voulez changer dans une note ou dans la conversation d'origine – les deux comptent ; l'Agent posera des questions si besoin. L'envoi seul ne modifie pas le modèle.",
  "help.p6.named":
    "« Envoyer à {agent} » enregistre et transmet les marques avec leurs notes. Dites ce que vous voulez changer dans une note ou dans la conversation d'origine – les deux comptent ; {agent} posera des questions si besoin. L'envoi seul ne modifie pas le modèle.",
  "help.p7":
    "Les onglets en haut listent chaque version livrée par l'Agent. Appuyez sur l'un d'eux pour la revoir, et vous pouvez marquer et envoyer directement sur une version ancienne — chaque version garde son propre brouillon, et changer d'onglet n'affecte pas les autres. Les marques reçues par l'Agent indiquent la version visée.",
  "help.p7.named":
    "Les onglets en haut listent chaque version livrée par {agent}. Appuyez sur l'un d'eux pour la revoir, et vous pouvez marquer et envoyer directement sur une version ancienne — chaque version garde son propre brouillon, et changer d'onglet n'affecte pas les autres. Les marques reçues par {agent} indiquent la version visée.",
  "help.p8":
    "« Envoyer à l'Agent » envoie ce lot ; l'Agent répond par une nouvelle version sur laquelle vous continuez à marquer. Rien n'a besoin d'être clos, et les brouillons s'enregistrent seuls.",
  "help.p8.named":
    "« Envoyer à {agent} » envoie ce lot ; {agent} répond par une nouvelle version sur laquelle vous continuez à marquer. Rien n'a besoin d'être clos, et les brouillons s'enregistrent seuls.",
  "help.p9":
    "GLB, STL et STEP, jusqu'à 80 Mo et 600 000 triangles. Un STEP est triangulé une seule fois à son arrivée et vos annotations portent sur ce maillage ; le téléchargement renvoie toujours le STEP lui-même. Un STL ne porte aucune couleur et s'affiche donc toujours en gris ; les couleurs viennent avec STEP et GLB. Animation, squelettes et GLB compressé ne sont pas encore pris en charge. C'est un outil de revue ; il ne sculpte pas le modèle.",

  "tool.measure": "Mesurer",
  "tool.measureLabel": "Outil de mesure",
  "tool.measureTitle":
    "Mesure entre deux points, le long d'une arête, entre deux faces ou le diamètre d'un cercle ; rien n'est gardé sans « Garder »",
  "hint.measurePoints":
    "Cliquez deux points · les coins s'aimantent · le bouton droit pivote toujours",
  "hint.measureEdge":
    "Pointez une arête droite et cliquez pour lire sa longueur · le bouton droit pivote toujours",
  "hint.measurePlanes":
    "Cliquez une face plane, puis une autre · le bouton droit pivote toujours",
  "hint.measureCircle":
    "Cliquez trois points sur le bord d'un trou ou d'un arbre · les coins s'aimantent · le bouton droit pivote toujours",
  "measure.kinds": "Quoi mesurer",
  "measure.points": "Point à point",
  "measure.edge": "Longueur d'arête",
  "measure.planes": "Deux faces",
  "measure.circle": "Cercle par 3 points",
  "measure.nextPoint": "Cliquez le second point",
  "measure.nextFace": "Cliquez la seconde face",
  "measure.circleSecond": "Cliquez le deuxième point",
  "measure.circleThird": "Cliquez le troisième point",
  "measure.keep": "Garder",
  "measure.keepTitle":
    "Garder cette mesure comme marque ; elle part avec les autres",
  "measure.name": "Mesure {label}",
  "measure.unitless": "{value} (sans unité)",
  "measure.diameter": "⌀{value}",
  "measure.noEdge":
    "Pas d'arête droite ici — pointez plus près d'une arête vive.",
  "measure.curved":
    "Cette arête est courbe ; seules les arêtes droites se mesurent.",
  "measure.sameFace": "C'est la même face — cliquez-en une autre.",
  "measure.curvedFace":
    "Cette face est courbe ; seules les faces planes se mesurent.",
  "measure.noCircle":
    "Aucun cercle ne passe par ces points — cliquez trois points distincts, répartis sur le bord.",
  "help.p10":
    "Mesurer : choisissez l'outil de mesure, puis « Point à point » (les coins s'aimantent), « Longueur d'arête », « Deux faces » — deux faces parallèles donnent leur écart, toutes les autres l'angle entre elles — ou « Cercle par 3 points » : trois clics sur le bord d'un trou ou d'un arbre donnent son diamètre. Sur un STEP, une face est celle du fichier, entière, et une arête l'endroit où deux d'entre elles se rencontrent. Les millimètres s'affichent avec deux décimales ; un modèle sans unité n'affiche que le nombre. Une mesure disparaît à la suivante, sauf si vous appuyez sur « Garder » : elle devient alors une marque que vous pouvez annoter, annuler, supprimer et envoyer.",
  "help.p11":
    "Après « Envoyer à l'Agent », les lignes sous le bouton suivent le lot : combien de marques sont parties, puis l'heure à laquelle l'Agent les a lues, puis ce qu'il a compris, qui s'affiche en bas à droite du modèle. Quand il désigne des endroits du modèle, il en dessine uniquement les contours en pointillés cyan animés, avec un halo doux, au-dessus de vos propres marques et sans remplir les zones. Un nouvel écho illumine brièvement le halo ; si la réduction des animations est activée, il reste immobile. Si l'Agent ne peut pas être prévenu automatiquement, le panneau le dit et vous donne une phrase à coller dans sa conversation.",
  "help.p11.named":
    "Après « Envoyer à {agent} », les lignes sous le bouton suivent le lot : combien de marques sont parties, puis l'heure à laquelle {agent} les a lues, puis sa compréhension, qui s'affiche en bas à droite du modèle. Quand des endroits du modèle sont désignés, seuls leurs contours sont dessinés en pointillés cyan animés, avec un halo doux, au-dessus de vos propres marques et sans remplir les zones. Un nouvel écho illumine brièvement le halo ; si la réduction des animations est activée, il reste immobile. Si {agent} ne peut pas être prévenu automatiquement, le panneau le dit et vous donne une phrase à coller dans la conversation.",
};
