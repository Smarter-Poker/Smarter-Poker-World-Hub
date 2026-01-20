export default function TrainingGamePlay() {
    return (
        <iframe
            src={`/training-ui/index.html?v=${Date.now()}`}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                border: 'none',
                margin: 0,
                padding: 0,
                overflow: 'hidden'
            }}
        />
    );
}
