import { mobileTabletCheck } from "./utils.js";

const IS_MOBILE = mobileTabletCheck();

export default {
    DEFAULT_MODEL: "quickdraw-mobilevit-small",
    DEFAULT_QUANTIZED: false,
    BANNED_LABELS: [
        // List of banned labels, because they are either:
        // - Too similar to other labels
        // - Too difficult to draw
        // - Too difficult to understand
        // - Ambiguous
        "animal migration", // too difficult to understand
        "arm", // too similar to "elbow"
        "barn", // too similar to other types of buildings
        "bat", // ambiguous (animal vs. sports equipment)
        "brain", // too difficult to draw
        "coffee cup", // too similar to mug
        "circle", // when scaled down, always detected as an octogon
        "hexagon", // too similar to octogon
        "stitches", // too similar to lightning/zigzag
        "sweather", // too similar to "jacket"
        "van", // too similar to other types of vehicles
    ],
    PREDICTION_REFRESH_TIME: 10,
    BRUSH_SIZE: IS_MOBILE ? 12 : 16,
    TARGET_FPS: 60,
    GAME_DURATION: 60 + 0.5, // + 0.5 so it doesn't flicker (TODO: change to 60)
    COUNTDOWN_TIMER: 3,

    START_REJECT_THRESHOLD: 0.2, // How confident the model should be before starting to reject
    REJECT_TIME_DELAY: 3 * 1000, // How many ms to wait before helping
    REJECT_TIME_PER_LABEL: 3 * 1000, // How many ms to reject a label for after it's been drawn

    SKIP_PENALTY: 3 * 1000, // How much to penalize for skipping a drawing
};
