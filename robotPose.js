const torsoId=0, head1Id=1, leftUpperArmId=2, leftLowerArmId=3, rightUpperArmId=4, rightLowerArmId=5,
      leftUpperLegId=6, leftLowerLegId=7, rightUpperLegId=8, rightLowerLegId=9, head2Id=10,
      leftUpperArmSideId=11, rightUpperArmSideId=12, leftUpperLegSideId=13, rightUpperLegSideId=14,
      leftHandId=15, rightHandId=16;

const numAngles = 17;
const theta = new Array(numAngles).fill(0);

const jointConstraints = {
  [torsoId]: [-180, 180],
  [head1Id]: [-45, 45],  [head2Id]: [-80, 80],
  [leftUpperArmId]: [-180, 0],   [rightUpperArmId]: [-90, 90],
  [leftLowerArmId]: [-135, 0],   [rightLowerArmId]: [-135, 0],
  [leftUpperLegId]: [-45, 75],   [rightUpperLegId]: [-45, 75],
  [leftLowerLegId]: [0, 135],    [rightLowerLegId]: [0, 135],
  [leftUpperArmSideId]: [0,110], [rightUpperArmSideId]: [-110,90],
  [leftUpperLegSideId]: [-30,30],[rightUpperLegSideId]: [-30,30],
  [leftHandId]: [-45,45],          [rightHandId]: [-45,45]
};

function clampJoint(id, val){
  const lim = jointConstraints[id];
  return lim ? Math.max(lim[0], Math.min(lim[1], val)) : val;
}

const NAME = {
  torso: "torso",
  head: "head",
  lArmHi: "left_arm_high",
  lArmLo: "left_arm_low",
  rArmHi: "right_arm_high",
  rArmLo: "right_arm_low",
  lLegHi: "left_leg_high",
  lLegLo: "left_leg_low",
  rLegHi: "right_leg_high",
  rLegLo: "right_leg_low",
  lHand: "left_hand",
  rHand: "right_hand"
};

// which angle IDs a node controls (primary via horizontal drag, secondary via vertical drag)
const nodeToAngleMapByName = {
  [NAME.torso]:   { primary: torsoId,         secondary: null },
  [NAME.head]:    { primary: head1Id,         secondary: head2Id },
  [NAME.lArmHi]:  { primary: leftUpperArmId,  secondary: leftUpperArmSideId },
  [NAME.lArmLo]:  { primary: leftLowerArmId,  secondary: null },
  [NAME.rArmHi]:  { primary: rightUpperArmId, secondary: rightUpperArmSideId },
  [NAME.rArmLo]:  { primary: rightLowerArmId, secondary: null },
  [NAME.lLegHi]:  { primary: leftUpperLegId,  secondary: leftUpperLegSideId },
  [NAME.lLegLo]:  { primary: leftLowerLegId,  secondary: null },
  [NAME.rLegHi]:  { primary: rightUpperLegId, secondary: rightUpperLegSideId },
  [NAME.rLegLo]:  { primary: rightLowerLegId, secondary: null },
  [NAME.lHand]:   { primary: leftHandId,      secondary: null },
  [NAME.rHand]:   { primary: rightHandId,     secondary: null }
};

const RX = (deg)=> rotate(deg, 1,0,0);
const RY = (deg)=> rotate(deg, 0,1,0);
const RZ = (deg)=> rotate(deg, 0,0,1);

function buildPoseTransforms(){
  const pose = {};
  // torso twist (yaw)
  pose[NAME.torso] = RY(theta[torsoId]);
  // head: pitch then yaw
  pose[NAME.head] = mult(RX(theta[head1Id]), RY(theta[head2Id]));
  // shoulders: side (Z) then pitch (X)
  pose[NAME.lArmHi] = mult(RZ(theta[leftUpperArmSideId]), RX(theta[leftUpperArmId]));
  pose[NAME.rArmHi] = mult(RZ(theta[rightUpperArmSideId]), RX(-theta[rightUpperArmId]));
  // elbows
  pose[NAME.lArmLo] = RX(theta[leftLowerArmId]);
  pose[NAME.rArmLo] = RX(theta[rightLowerArmId]);
  // hips
  pose[NAME.lLegHi] = mult(RZ(theta[leftUpperLegSideId]), RX(theta[leftUpperLegId]));
  pose[NAME.rLegHi] = mult(RZ(theta[rightUpperLegSideId]), RX(theta[rightUpperLegId]));
  // knees
  pose[NAME.lLegLo] = RX(theta[leftLowerLegId]);
  pose[NAME.rLegLo] = RX(theta[rightLowerLegId]);
  // hands (positive = inward for both) — fixed sign for right hand
  pose[NAME.lHand] = RZ(-theta[leftHandId]);
  pose[NAME.rHand] = RX(theta[rightHandId]);

  return pose;
}

function traverseWithPose(node, parentT, pose, cb){
  let t = mult(parentT, node.transformation);
  if (pose[node.name]) t = mult(t, pose[node.name]);
  cb(node, t);
  for (const c of (node.children || [])) traverseWithPose(c, t, pose, cb);
}

function findNodeAndT(root, pose, targetName){
  let out = null;
  traverseWithPose(root, mat4(), pose, (node, t) => {
    if (!out && node.name === targetName) out = { node, t };
  });
  return out;
}

function scaleUniform(s){
  const S = mat4();
  S[0][0]=s; S[1][1]=s; S[2][2]=s;
  return S;
}

