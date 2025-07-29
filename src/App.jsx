import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import SketchCanvas from "./components/SketchCanvas";
import constants from "./constants";
import Menu from "./components/Menu";
import GameOver from "./components/GameOver";
import Countdown from "./components/Countdown";
import { AnimatePresence } from "framer-motion";

const formatTime = (seconds) => {
    seconds = Math.floor(seconds);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
};

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function App() {
    const [ready, setReady] = useState(false);
    const [labels, setLabels] = useState(null); // ✅ NEW

    const [gameState, setGameState] = useState("menu");
    const [countdown, setCountdown] = useState(constants.COUNTDOWN_TIMER);
    const [gameCurrentTime, setGameCurrentTime] = useState(null);
    const [gameStartTime, setGameStartTime] = useState(null);
    const [output, setOutput] = useState(null);
    const [isPredicting, setIsPredicting] = useState(false);
    const [sketchHasChanged, setSketchHasChanged] = useState(false);

    const [targets, setTargets] = useState(null);
    const [targetIndex, setTargetIndex] = useState(0);
    const [predictions, setPredictions] = useState([]);

    const worker = useRef(null);
    const canvasRef = useRef(null);

    useEffect(() => {
        if (!worker.current) {
            worker.current = new Worker(
                new URL("./worker.js", import.meta.url),
                { type: "module" }
            );
        }

        const onMessageReceived = (e) => {
            const result = e.data;

            switch (result.status) {
                case "ready":
                    setLabels(result.labels); // ✅ NEW
                    setReady(true);
                    beginCountdown(result.labels); // ✅ NEW
                    break;
                case "result":
                    setIsPredicting(false);
                    const filteredResult = result.data.filter(
                        (x) => !constants.BANNED_LABELS.includes(x.label)
                    );

                    const timespent = canvasRef.current.getTimeSpentDrawing();
                    const applyEasyMode =
                        timespent - constants.REJECT_TIME_DELAY;

                    if (
                        applyEasyMode > 0 &&
                        filteredResult[0].score >
                            constants.START_REJECT_THRESHOLD
                    ) {
                        let amount =
                            applyEasyMode / constants.REJECT_TIME_PER_LABEL;

                        for (
                            let i = 0;
                            i < filteredResult.length && i < amount + 1;
                            ++i
                        ) {
                            if (
                                filteredResult[i].label === targets[targetIndex]
                            )
                                continue;
                            if (amount > i) {
                                filteredResult[i].score = 0;
                            } else {
                                filteredResult[i].score *= i - amount;
                            }
                        }

                        filteredResult.sort((a, b) => b.score - a.score);
                    }

                    const sum = filteredResult.reduce(
                        (acc, x) => acc + x.score,
                        0
                    );
                    filteredResult.forEach((x) => (x.score /= sum));
                    setOutput(filteredResult);
                    break;
            }
        };

        worker.current.addEventListener("message", onMessageReceived);
        return () =>
            worker.current.removeEventListener("message", onMessageReceived);
    }, [targetIndex, targets]);

    const classify = useCallback(() => {
        if (worker.current && canvasRef.current) {
            const image = canvasRef.current.getCanvasData();
            if (image !== null) {
                setIsPredicting(true);
                worker.current.postMessage({ action: "classify", image });
            }
        }
    }, []);

    const handleEndGame = (cancelled = false) => {
        endGame(cancelled);
    };

    const handleClearCanvas = (reset = false) => {
        if (canvasRef.current) {
            canvasRef.current.clearCanvas(reset);
        }
    };

    const beginCountdown = (labelList) => {
        setGameState("countdown");
        const possibleLabels = labelList.filter(
            (x) => !constants.BANNED_LABELS.includes(x)
        );
        shuffleArray(possibleLabels);
        setTargets(possibleLabels);
        setTargetIndex(0);
    };

    const handleMainClick = () => {
        if (!ready) {
            setGameState("loading");
            worker.current.postMessage({ action: "load" });
        } else {
            beginCountdown(labels);
        }
    };

    const handleGameOverClick = (playAgain) => {
        if (playAgain) {
            beginCountdown(labels);
        } else {
            endGame(true);
        }
    };

    useEffect(() => {
        if (gameState === "countdown" && countdown <= 0) {
            setGameStartTime(performance.now());
            setPredictions([]);
            setGameState("playing");
        }
    }, [gameState, countdown]);

    const addPrediction = useCallback(
        (isCorrect) => {
            const image = canvasRef.current.getCanvasData();
            setPredictions((prev) => [
                ...prev,
                {
                    output: output?.[0] ?? null,
                    image: image,
                    correct: isCorrect,
                    target: targets[targetIndex],
                },
            ]);
        },
        [output, targetIndex, targets]
    );

    const endGame = useCallback(
        (cancelled = false) => {
            if (!cancelled) {
                addPrediction(false);
            }
            setGameStartTime(null);
            setOutput(null);
            setSketchHasChanged(false);
            handleClearCanvas(true);
            setCountdown(constants.COUNTDOWN_TIMER);
            setGameState(cancelled ? "menu" : "end");
        },
        [addPrediction]
    );

    useEffect(() => {
        if (
            gameState === "playing" &&
            gameCurrentTime !== null &&
            gameStartTime !== null &&
            (gameCurrentTime - gameStartTime) / 1000 > constants.GAME_DURATION
        ) {
            endGame();
        }
    }, [endGame, gameState, gameStartTime, gameCurrentTime]);

    const goNext = useCallback(
        (isCorrect = false) => {
            if (!isCorrect) {
                setGameStartTime((prev) => prev - constants.SKIP_PENALTY);
            }
            addPrediction(isCorrect);
            setTargetIndex((prev) => prev + 1);
            setOutput(null);
            setSketchHasChanged(false);
            handleClearCanvas(true);
        },
        [addPrediction]
    );

    useEffect(() => {
        if (gameState === "playing" && output && targets) {
            if (targets[targetIndex] === output[0].label) {
                goNext(true);
            }
        }
    }, [goNext, gameState, output, targets, targetIndex]);

    useEffect(() => {
        if (gameState === "countdown") {
            const countdownTimer = setInterval(() => {
                setCountdown((prevCount) => prevCount - 1);
            }, 1000);
            return () => clearInterval(countdownTimer);
        } else if (gameState === "playing") {
            const classifyTimer = setInterval(() => {
                if (sketchHasChanged && !isPredicting) {
                    classify();
                }
                setSketchHasChanged(false);
                setGameCurrentTime(performance.now());
            }, constants.PREDICTION_REFRESH_TIME);
            return () => clearInterval(classifyTimer);
        } else if (gameState === "end") {
            handleClearCanvas(true);
        }
    }, [gameState, sketchHasChanged, isPredicting, classify]);

    useEffect(() => {
        if (gameState === "playing") {
            const preventDefault = (e) => e.preventDefault();
            document.addEventListener("touchmove", preventDefault, {
                passive: false,
            });
            return () =>
                document.removeEventListener("touchmove", preventDefault);
        }
    }, [gameState]);

    const menuVisible = gameState === "menu" || gameState === "loading";
    const isPlaying = gameState === "playing";
    const countdownVisible = gameState === "countdown";
    const gameOver = gameState === "end";

    return (
        <>
            <div
                className={`h-full w-full top-0 left-0 absolute ${
                    isPlaying ? "" : "pointer-events-none"
                }`}
            >
                <SketchCanvas
                    onSketchChange={() => setSketchHasChanged(true)}
                    ref={canvasRef}
                />
            </div>

            <AnimatePresence initial={false} mode="wait">
                {menuVisible && (
                    <Menu gameState={gameState} onClick={handleMainClick} />
                )}
            </AnimatePresence>

            <AnimatePresence initial={false} mode="wait">
                {countdownVisible && <Countdown countdown={countdown} />}
            </AnimatePresence>

            <AnimatePresence initial={false} mode="wait">
                {gameOver && (
                    <GameOver
                        predictions={predictions}
                        onClick={handleGameOverClick}
                    />
                )}
            </AnimatePresence>

            {isPlaying && gameCurrentTime && targets && (
                <div className="absolute top-5 text-center">
                    <h2 className="text-4xl">
                        Draw &quot;{targets[targetIndex]}&quot;
                    </h2>
                    <h3 className="text-2xl">
                        {formatTime(
                            Math.max(
                                constants.GAME_DURATION -
                                    (gameCurrentTime - gameStartTime) / 1000,
                                0
                            )
                        )}
                    </h3>
                </div>
            )}

            {isPlaying && (
                <div className="absolute bottom-5 text-center">
                    <h1 className="text-2xl font-bold mb-3">
                        {output &&
                            `Prediction: ${output[0].label} (${(
                                100 * output[0].score
                            ).toFixed(1)}%)`}
                    </h1>

                    <div className="flex gap-2 justify-center">
                        <button
                            onClick={handleClearCanvas}
                            className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
                        >
                            Clear
                        </button>
                        <button
                            onClick={() => goNext(false)}
                            className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
                        >
                            Skip
                        </button>
                        <button
                            onClick={() => handleEndGame(true)}
                            className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
                        >
                            Exit
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}

export default App;
