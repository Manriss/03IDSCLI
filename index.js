#!/usr/bin/env node

import { select } from "@inquirer/prompts";
import * as fs from "fs";
import * as path from "path";
import * as OBC from "@thatopen/components";
import * as THREE from 'three'

function getFiles(extension) {
   
 return fs.readdirSync(process.cwd()).filter((file) => {

   return path.extname(file).toLowerCase() === extension.toLowerCase();
  });
}

const promtUser = async () => {
  const ifcFiles = getFiles(".ifc");
  const idsFiles = getFiles(".ids");

  if (ifcFiles.length === 0 || idsFiles.length === 0) {
    console.log("No IFC files or IDS files in the directory!");
    return;
  }
  const ifcFile = await select({
    message: "select IFC file: ",
    choices: ifcFiles,
  });
  const idsFile = await select({
    message: "select IDS file: ",
    choices: idsFiles,
  });
  const ifcPath = path.join(process.cwd(), ifcFile);
  const idsPath = path.join(process.cwd(), idsFile);

  return { ifcPath, idsPath };
};

const checkIFC = async () => {
  const selectedFiles = await promtUser();
  if (!selectedFiles) return;

  const ifc = fs.readFileSync(selectedFiles.ifcPath); //lee como array buffer
  const ids = fs.readFileSync(selectedFiles.idsPath, "utf-8"); //lee como texto

  const components = new OBC.Components()

  const ifcLoader = components.get(OBC.IfcLoader)

  const ifcBuffer = new Uint8Array(ifc.buffer);
  const model = await ifcLoader.load(ifcBuffer);
  const indexer = components.get(OBC.IfcRelationsIndexer)
  await indexer.process(model)

  const idsSpecs = components.get(OBC.IDSSpecifications);
  const idsSpec = idsSpecs.load(ids);
  const topics=components.get(OBC.BCFTopics)
  topics.setup({version:2.1})
  const world=components.get(OBC.Worlds).create()
  const viewpoints=components.get(OBC.Viewpoints)

  for (const [index, spec] of idsSpec.entries()) {
    const result = await spec.test(model);
    const failingGuids=result
    .filter(check=>!check.pass)
    .map(check=>check.guid)
    .filter(guid=>guid)
    console.log("Failing elements: ",failingGuids)

    const topic=topics.create({
      title:"Failing information requirements",
      description:idsSpec.description
    })
    const viewpoint=new OBC.Viewpoint(components,world,{setCamera:false})
    viewpoints.list.set(viewpoint.guid,viewpoint)
    viewpoint.selectionComponents.add(...failingGuids)
    viewpoint.componentColors.set(new THREE.Color("red"),failingGuids)
    topic.viewpoints.add(viewpoint.guid)
    const bcfBlob=await topics.export([topic])
    const bcfData=Buffer.from(await bcfBlob.arrayBuffer())
    const exportPath=path.join(process.cwd(),`result-${index + 1}.bcf`)
    
    fs.writeFileSync(exportPath,bcfData)
  }
};
//run it
checkIFC();
