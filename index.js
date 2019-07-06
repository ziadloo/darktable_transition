const argv = require('yargs').argv;
const { execFile } = require('child_process');
const parser = require('xml2json');
const fs = require('fs');
const path = require('path');
const jp = require('jsonpath');
const tempDirectory = require('temp-dir');
const _cliProgress = require('cli-progress');
const spline = require('natural-spline-interpolator');
const os = require('os');
const { Float32ToHex,
    HexToFloat32,
    SwapEndianness } = require('./float2hex');

function filenameToNumber(filename, files) {
    let counter = 0;
    for (let index in files) {
        if (files[index] === filename) {
            return counter;
        }
        counter++;
    }
}

function getXmp(folder, filename, fileNumber, operations, template) {
    const text = fs.readFileSync(path.join(folder, `${filename}.xmp`), 'utf8');
    const json = parser.toJson(text, {object: true, reversible: true});
    let operationsParentPath = jp.paths(json, "$..['darktable:history']..*[?(@['darktable:operation'])]");
    let operationParent = null;
    if (operationsParentPath.length === 0) {
        operationParent = jp.value(json, "$..['darktable:history']");
        operationParent['rdf:Seq'] = {"rdf:li": []};
        operationParent = operationParent['rdf:Seq']["rdf:li"];
    }
    else {
        operationsParentPath[0].pop();
        operationParent = jp.value(json, jp.stringify(operationsParentPath[0]));
        if (!Array.isArray(operationParent)) {
            const propertyName = Object.keys(operationParent)[0];
            const propertyValue = Object.values(operationParent)[0];
            operationParent[propertyName] = [propertyValue];
            operationParent = operationParent[propertyName];
        }
    }

    Object.keys(operations).map(opName => {
        const templateOp = jp.nodes(template, `$..['darktable:history']..*[?(@['darktable:operation']=='${opName}')]`);
        return Object.assign({}, templateOp[0].value, {
            "darktable:params": operations[opName](fileNumber),
        });
    }).forEach(op => operationParent.push(op));
    const description = jp.value(json, "$..[?(@['darktable:history_end'])]");
    description["darktable:history_end"] = operationParent.length.toString();
    return parser.toXml(json);
}

function decodeParams(str) {
    const params = [];
    for (let i=0; i<str.length; i+=8) {
        params.push(HexToFloat32(SwapEndianness(str.substr(i, 8))));
    }
    return params;
}

function encodeParams(numbers) {
    let result = "";
    for (let i=0; i<numbers.length; i++) {
        if (typeof numbers[i] === "number") {
            result += SwapEndianness(Float32ToHex(numbers[i]));
        }
        else {
            result += numbers[i].toString();
        }
    }
    return result;
}

function commonOperations(folder, imageFilenames, keyFrameFilenames) {
    const globalOperationCounter = {};
    const keyFrames = [];
    keyFrameFilenames.forEach(kf => {
        const text = fs.readFileSync(path.join(folder, `${kf}.xmp`), 'utf8');
        const json = parser.toJson(text, {object: true, reversible: true});

        const operationNames = jp.nodes(json, "$..['darktable:history']..['darktable:operation']");

        const localUniqueOperations = {};
        operationNames.forEach(op => {
            op.path.pop();
            localUniqueOperations[op.value] = jp.value(json, jp.stringify(op.path))['darktable:params'];
        });

        keyFrames.push({
            filename: kf,
            operations: localUniqueOperations,
        });

        Object.keys(localUniqueOperations).forEach(op => {
            if (!globalOperationCounter[op]) {
                globalOperationCounter[op] = 0;
            }
            globalOperationCounter[op]++;
        });
    });

    const operations = Object.keys(globalOperationCounter)
    //Only keep the operations that are shared among all the key frames
        .filter(opName => globalOperationCounter[opName] === keyFrameFilenames.length)
        .reduce((acc, opName) => {
            const op = {};

            const xs = keyFrames.map(kf => filenameToNumber(kf.filename, imageFilenames));
            const yss = keyFrames.map(kf => decodeParams(kf.operations[opName]));

            const splines = [];
            for (let i=0; i<yss[0].length; i++) {
                const undecodableIndex = yss.findIndex((ys, index) =>
                    encodeParams([ys[i]]) !== keyFrames[index].operations[opName].substr(i*8, 8));

                if (undecodableIndex === -1) {
                    splines.push(spline(xs.map((x, index) => [x, yss[index][i]])));
                }
                else {
                    splines.push(x => {
                        if (x <= filenameToNumber(keyFrames[0].filename, imageFilenames)) {
                            return keyFrames[0].operations[opName].substr(i*8, 8);
                        }
                        else if (x >= filenameToNumber(keyFrames[keyFrames.length-1].filename, imageFilenames)) {
                            return keyFrames[keyFrames.length-1].operations[opName].substr(i*8, 8);
                        }
                        else {
                            const kfIndex = keyFrames.findIndex(kf => x >= filenameToNumber(kf.filename, imageFilenames));
                            return keyFrames[kfIndex].operations[opName].substr(i*8, 8);
                        }
                    });
                }
            }

            op[opName] = (x) => {
                const params = splines.map(sp => sp(x));
                return encodeParams(params);
            };
            return Object.assign({}, acc, op);
        }, {});

    return operations;
}

function exec(cmd, params) {
    const child = execFile(cmd, params);
    child.stdout.on('data', (d) => {/*console.log(d);*/});
    child.stderr.on('data',  (d) => {/*console.log(d);*/});
    child.on('close', () => {});
    return new Promise((resolve, reject) => {
        child.addListener("error", reject);
        child.addListener("exit", resolve);
    });
}


if (!argv.folder) {
    throw `The --folder input is missing`;
}

if (!argv.keyframes) {
    throw `The --keyframes is missing`;
}

if (!argv.ext) {
    throw `The --ext is missing`;
}


const ext = argv.ext;
const folder = argv.folder;
if (!fs.lstatSync(folder).isDirectory()) {
    throw `The folder ${folder} was not found`;
}
const imageFilenames = fs.readdirSync(folder).filter(f => f.endsWith(ext));
const missingXmps = imageFilenames.filter(fn => !fs.lstatSync(path.join(folder, `${fn}.xmp`)).isFile());
if (missingXmps.length > 0) {
    throw `All the images need to be accompanied with xmp files. These images are missing xmp:\n${missingXmps.join("\n")}`;
}

const keyFrameFilenames = argv.keyframes.split(',').map(kf => kf.trim());
const missingKeyFrames = keyFrameFilenames.filter(kf => !imageFilenames.includes(kf));
if (missingKeyFrames.length > 0) {
    throw `These key frame(s) were not found in the list of images:\n${missingKeyFrames.join("\n")}`;
}

let concurrentTasks = os.cpus().length / 4;
if (argv.concurrency) {
    concurrentTasks = parseInt(argv.concurrency);
}

let outputFolder = null;
if (argv.output) {
    outputFolder = argv.output;
}
else {
    outputFolder = path.join(folder, 'output');
}
if (!fs.lstatSync(outputFolder).isDirectory()) {
    fs.mkdirSync(outputFolder, {recursive: true});
}

let outputExt = 'png';
if (argv.outputExt) {
    outputExt = argv.outputExt;
}

let params = [];
if (argv.width) {
    params.push(`--width ${argv.width}`);
}
if (argv.height) {
    params.push(`--width ${argv.height}`);
}
if (argv.bpp) {
    params.push(`--bpp ${argv.bpp}`);
}
if (argv.hq) {
    params.push(`--hq ${argv.hq}`);
}
if (argv.upscale) {
    params.push(`--upscale ${argv.upscale}`);
}
if (argv.core) {
    params.push(`--core ${argv.core}`);
}

//Finding common operations
const operations = commonOperations(folder, imageFilenames, keyFrameFilenames);

//Reports before the processing starts
console.log(`Number if images: ${imageFilenames.length}`);
console.log(`Number of key frames: ${keyFrameFilenames.length}`);
console.log(`Working on ${concurrentTasks} images concurrently`);
console.log(`List of operations interpolated:\n  - ${Object.keys(operations).join("\n  - ")}`);

//Use the first key frame as the template
const template = parser.toJson(fs.readFileSync(path.join(folder, `${keyFrameFilenames[0]}.xmp`), 'utf8'), {object: true, reversible: true});

let taskIndex = 0;
const bar = new _cliProgress.Bar({}, _cliProgress.Presets.shades_classic);
bar.start(imageFilenames.length, 0);

function worker(folder, outputFolder, imageFilenames, operations, template) {
    if (taskIndex < imageFilenames.length) {
        const f = imageFilenames[taskIndex];
        taskIndex++;
        const xmp = getXmp(folder, f, filenameToNumber(f, imageFilenames), operations, template);

        fs.writeFileSync(path.join(tempDirectory, `${f}.xmp`), xmp);
        return exec(`darktable-cli`, [path.join(folder, f), path.join(tempDirectory, `${f}.xmp`), path.join(outputFolder, `${f.split('.').slice(0, -1).join('.')}.${outputExt}`)].concat(params))
            .catch(err => {
                console.log(err);
                throw err;
            })
            .then(() => {
                fs.unlinkSync(path.join(tempDirectory, `${f}.xmp`));
                bar.increment();
                return worker(folder, outputFolder, imageFilenames, operations, template);
            });
    }
    else {
        return Promise.resolve();
    }
}


const conveyorBelts = [];
for (let c=0; c<concurrentTasks; c++) {
    conveyorBelts.push(worker(folder, outputFolder, imageFilenames, operations, template));
}

Promise.all(conveyorBelts)
    .then(() => {
        bar.stop();
    });
