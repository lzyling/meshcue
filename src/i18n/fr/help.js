export default {
  "help.p12":
    "Coupe : couper selon l’axe X, Y ou Z du modèle, régler le décalage dans les unités du modèle ou inverser le côté retiré. La face de coupe ambrée est une aide visuelle ; elle ne peut être ni marquée ni mesurée. Les faces avant restantes peuvent toujours être marquées et mesurées. La coupe sert uniquement à la visualisation, n’est jamais envoyée à l’Agent et se réinitialise au chargement d’un autre modèle ou d’une autre version.",
  "help.p12.named":
    "Coupe : couper selon l’axe X, Y ou Z du modèle, régler le décalage dans les unités du modèle ou inverser le côté retiré. La face de coupe ambrée est une aide visuelle ; elle ne peut être ni marquée ni mesurée. Les faces avant restantes peuvent toujours être marquées et mesurées. La coupe sert uniquement à la visualisation, n’est jamais envoyée à {agent} et se réinitialise au chargement d’un autre modèle ou d’une autre version.",

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
    "GLB, glTF, STL et STEP, jusqu'à 80 Mo et 600 000 triangles. Un STEP est triangulé une seule fois à son arrivée et vos annotations portent sur ce maillage ; le téléchargement renvoie toujours le STEP lui-même. Un STL ne porte aucune couleur et s'affiche donc toujours en gris ; les couleurs viennent avec STEP et GLB. Les compressions Draco et Meshopt sont prises en charge ; les animations et les squelettes ne le sont pas encore. C'est un outil de revue ; il ne sculpte pas le modèle.",
  "help.p10":
    "Mesurer : choisissez l'outil de mesure, puis « Point à point » (les coins s'aimantent), « Longueur d'arête », « Deux faces » — deux faces parallèles donnent leur écart, toutes les autres l'angle entre elles — ou « Cercle par 3 points » : trois clics sur le bord d'un trou ou d'un arbre donnent son diamètre. Sur un STEP, une face est celle du fichier, entière, et une arête l'endroit où deux d'entre elles se rencontrent. Les millimètres s'affichent avec deux décimales ; un modèle sans unité n'affiche que le nombre. Une mesure disparaît à la suivante, sauf si vous appuyez sur « Garder » : elle devient alors une marque que vous pouvez annoter, annuler, supprimer et envoyer.",
  "help.p11":
    "Après « Envoyer à l'Agent », les lignes sous le bouton suivent le lot : combien de marques sont parties, puis l'heure à laquelle l'Agent les a lues, puis ce qu'il a compris, qui s'affiche en bas à droite du modèle. Quand il désigne des endroits du modèle, il en dessine uniquement les contours en pointillés cyan animés, avec un halo doux, au-dessus de vos propres marques et sans remplir les zones. Un nouvel écho illumine brièvement le halo ; si la réduction des animations est activée, il reste immobile. Si l'Agent ne peut pas être prévenu automatiquement, le panneau le dit et vous donne une phrase à coller dans sa conversation.",
  "help.p11.named":
    "Après « Envoyer à {agent} », les lignes sous le bouton suivent le lot : combien de marques sont parties, puis l'heure à laquelle {agent} les a lues, puis sa compréhension, qui s'affiche en bas à droite du modèle. Quand des endroits du modèle sont désignés, seuls leurs contours sont dessinés en pointillés cyan animés, avec un halo doux, au-dessus de vos propres marques et sans remplir les zones. Un nouvel écho illumine brièvement le halo ; si la réduction des animations est activée, il reste immobile. Si {agent} ne peut pas être prévenu automatiquement, le panneau le dit et vous donne une phrase à coller dans la conversation.",
};
