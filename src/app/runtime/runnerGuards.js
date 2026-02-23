export function isAnyRunnerActive(...runners) {
    for (const runner of runners) {
        if (runner && typeof runner.isRunning === 'function' && runner.isRunning()) {
            return true;
        }
    }
    return false;
}

export function createRunnerGuard(...runnerAccessors) {
    return () => {
        const runners = runnerAccessors.map((getRunner) => {
            if (typeof getRunner === 'function') return getRunner();
            return getRunner;
        });
        return isAnyRunnerActive(...runners);
    };
}
