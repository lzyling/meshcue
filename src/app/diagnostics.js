export function installDiagnostics(review) {
  // Read-only diagnostics for browser acceptance checks; never mutate review state.
  window.__reviewDiagnostics = () => ({
    versionId: review.loadedId,
    modelFilename: review.loadedFilename,
    reviewId: review.loadedReviewId,
    draftCacheKey: review.draftKey(),
    precision: review.loadedPrecision,
    accessBlocked: review.accessBlocked,
    revision: review.revision,
    annotationCount: review.annotations.length,
    labelCursor: review.labelCursor,
    dirty: review.editSeq > review.savedSeq,
    annotations: review.viewer.serializeAnnotations(review.annotations),
    // The measurement on screen and not yet kept, as the reading shows it.
    measuring: review.measureReport,
    camera: review.viewer.cameraState(),
    // Which way the camera calls up. It is deliberately not part of the camera a
    // draft stores — that one is a place to stand, and this is how a view can be
    // upright from the right place and still be lying on its side.
    cameraUp: review.viewer.camera.up.toArray(),
    screenUp: review.viewer.screenUp(),
    viewer: review.viewer.stats(),
    locked: review.state?.locked,
    owned: review.state?.owned,
    viewing: review.viewingId,
    followActive: review.followActive,
    capabilities: review.state?.capabilities || null,
    versions: (review.state?.versions || []).map((v) => ({
      id: v.id,
      version: v.version,
      active: v.active,
      annotations: v.annotations,
      unsubmitted: v.unsubmitted,
      submissions: v.submissions,
    })),
  });
}
