const svgPaths = {
    audio: "M560-131v-82q90-26 145-100t55-168q0-94-55-168T560-749v-82q124 28 202 125.5T840-481q0 127-78 224.5T560-131ZM120-360v-240h160l200-200v640L280-360H120Zm440 40v-322q47 22 73.5 66t26.5 96q0 51-26.5 94.5T560-320ZM400-606l-86 86H200v80h114l86 86v-252ZM300-480Z",
    video: "M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h480q33 0 56.5 23.5T720-720v180l160-160v440L720-420v180q0 33-23.5 56.5T640-160H160Zm0-80h480v-480H160v480Zm0 0v-480 480Z",
    image: "M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm40-80h480L570-480 450-320l-90-120-120 160Zm-40 80v-560 560Z",
    data: "M320-240h320v-80H320v80Zm0-160h320v-80H320v80ZM240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H240Zm280-520v-200H240v640h480v-440H520ZM240-800v200-200 640-640Z",
    multi: "M160-120q-50 0-85-35t-35-85q0-50 35-85t85-35q9 0 17.5 1.5T194-355l162-223q-17-21-26.5-47t-9.5-55q0-66 47-113t113-47q66 0 113 47t47 113q0 29-10 55t-27 47l163 223q8-2 16.5-3.5T800-360q50 0 85 35t35 85q0 50-35 85t-85 35q-50 0-85-35t-35-85q0-19 5.5-36.5T701-308L539-531q-5 2-9.5 3t-9.5 3v172q35 12 57.5 43t22.5 70q0 50-35 85t-85 35q-50 0-85-35t-35-85q0-39 22.5-69.5T440-353v-172q-5-2-9.5-3t-9.5-3L259-308q10 14 15.5 31.5T280-240q0 50-35 85t-85 35Zm0-80q17 0 28.5-11.5T200-240q0-17-11.5-28.5T160-280q-17 0-28.5 11.5T120-240q0 17 11.5 28.5T160-200Zm320-480Zm0 480q17 0 28.5-11.5T520-240q0-17-11.5-28.5T480-280q-17 0-28.5 11.5T440-240q0 17 11.5 28.5T480-200Zm320 0q17 0 28.5-11.5T840-240q0-17-11.5-28.5T800-280q-17 0-28.5 11.5T760-240q0 17 11.5 28.5T800-200Zm-640-40Zm320 0Zm320 0ZM480-600q33 0 56.5-23.5T560-680q0-33-23.5-56.5T480-760q-33 0-56.5 23.5T400-680q0 33 23.5 56.5T480-600Z",
};

export const formatPrecedence = [
    "urn:x-nmos:format:video",
    "urn:x-nmos:format:image",
    "urn:x-nmos:format:audio",
    "urn:x-nmos:format:data",
]

export const nodeSize = {
    height: 60,
    width: 120,
}

export const styles = {
    nodes: {
        flow: { backgroundColor: "#bfffff" },
        source: { backgroundColor: "#ffffbf" },
    },
    edges: {
        represents: {
            lineColor: "#8e8e8e",
            targetArrowColor: "#8e8e8e",
            curveStyle: "straight",
            sourceEndpoint: "outside-to-line",
            targetEndpoint: "outside-to-line",
        },
        collects: {
            lineColor: "#5dfdff",
            targetArrowColor: "#5dfdff",
            curveStyle: "bezier",
            sourceEndpoint: "outside-to-line",
            targetEndpoint: "outside-to-line",
        },
        implied: {
            lineStyle: "dashed",
        },
    },
};

export const buildStylesheet = () => ([
    // Base Node styling
    {
        selector: "node",
        style: {
            label: "data(label)",
            shape: "round-rectangle",
            ...nodeSize,
            borderWidth: 1,
            fontSize: 5,
            fontFamily: "sans-serif",
            fontWeight: "bold",
            textValign: "center",
            textHalign: "right",
            textWrap: "wrap",
            textOverflowWrap: "anywhere",
            textMarginX: "-115px",
            textMaxWidth: "110px",
        },
    },
    // Base Edge styling
    {
        selector: "edge",
        style: {
            width: 1,
            targetArrowShape: "chevron",
            arrowScale: 0.5,
        },
    },
    // Selected Node styling
    {
        selector: 'node:selected',
        style: {
            borderWidth: 1.5,
            borderColor: "red",
        }
    },
    // Node type specific styling
    ...Object.entries(styles.nodes).map(([type, props]) => ({ selector: `node.${type}`, style: props })),
    // Node format specific styling
    ...Object.entries(svgPaths).map(([format, d]) => ({ selector: `node.${format}`, style: { backgroundOffsetX: "50px", backgroundOffsetY: "20px", backgroundImage: encodeURI(`data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="18px" height="18px" viewBox="0 -960 960 960"><path d="${d}"/></svg>`) } })),
    // Edge type specific styling
    ...Object.entries(styles.edges).map(([type, props]) => ({ selector: `edge.${type}`, style: props })),
])
