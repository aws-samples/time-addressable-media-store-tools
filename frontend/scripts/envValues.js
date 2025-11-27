#!/usr/bin/env node
import { program } from "commander";
import process from "process";
import chalk from "chalk";
import toml from "toml";
import { promises as fs } from "fs";
import {
  CloudFormationClient,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";
import { fromIni } from "@aws-sdk/credential-providers";

async function parseToml(tomlPath, env) {
  const tomlData = await readToml(tomlPath);
  const tomlParameters = {
    ...tomlData[env].global?.parameters,
    ...tomlData[env].deploy.parameters,
  };
  const parameterOverrides = Object.fromEntries(
    tomlParameters.parameter_overrides.split(/\s+/).map((pair) => {
      const [key, value] = pair.split("=");
      return [key, value.replace(/"/g, "")];
    })
  );
  const result = {
    profile: tomlParameters.profile ?? "default",
    region: tomlParameters.region,
    apiStackName: parameterOverrides.ApiStackName,
    toolsStackName: tomlParameters.stack_name,
  };
  if (Object.values(result).some((v) => !v)) {
    console.log(
      chalk.yellow(
        "Unable to find Region and/or Stack Name(s) in specified toml."
      )
    );
    console.log(
      "Expecting to find properties with names:",
      chalk.yellow("region"),
      ",",
      chalk.yellow("stack_name"),
      "and",
      chalk.yellow("parameter_overrides"),
      "in the",
      chalk.yellow("[<env>.deploy.parameters]"),
      "section of the toml file."
    );
    console.log(
      "The",
      chalk.yellow("parameter_overrides"),
      "value needs to contain the the",
      chalk.yellow("ApiStackName"),
      "parameter value."
    );
    process.exit(1);
  }
  return result;
}

async function readToml(tomlPath) {
  try {
    const tomlRaw = await fs.readFile(tomlPath, "utf-8");
    const tomlData = toml.parse(tomlRaw);
    return tomlData;
  } catch (error) {
    if (error.name == "Error" && error.code == "ENOENT") {
      console.log(chalk.red(error.message));
    } else if (error.name == "SyntaxError") {
      console.log(chalk.red("Unable to parse specified toml file"));
    } else {
      console.log(chalk.red(error));
    }
    process.exit(1);
  }
}

async function getCloudFormationOutputs(profile, region, stackName) {
  const cfnClient = new CloudFormationClient({
    region: region,
    credentials: fromIni({ profile }),
  });
  const describeStacks = new DescribeStacksCommand({ StackName: stackName });
  try {
    const describeStacksResp = await cfnClient.send(describeStacks);
    return describeStacksResp.Stacks[0].Outputs;
  } catch (error) {
    console.log(chalk.red(error));
    process.exit(1);
  }
}

async function run(samConfigEnv, options) {
  const tomlData = await parseToml(options.samTomlConfig, samConfigEnv);
  const apiOutputsRaw = await getCloudFormationOutputs(
    tomlData.profile,
    tomlData.region,
    tomlData.apiStackName
  );
  const toolsOutputsRaw = await getCloudFormationOutputs(
    tomlData.profile,
    tomlData.region,
    tomlData.toolsStackName
  );
  const outputs = {
    ...Object.fromEntries(
      [...apiOutputsRaw, ...toolsOutputsRaw].map((output) => [
        output.OutputKey,
        output.OutputValue,
      ])
    ),
    Region: tomlData.region,
  };
  const envTemplateData = await fs.readFile(options.envTemplate, "utf-8");
  const envData = envTemplateData
    .split("\n")
    .map((line) => {
      let processedLine = line;
      const matches = line.matchAll(/<(.+?)>/g);
      let hasMatch = false;
      for (const match of matches) {
        hasMatch = true;
        if (outputs[match[1]]) {
          processedLine = processedLine.replace(match[0], outputs[match[1]]);
        } else {
          console.log(
            chalk.yellow(`No output found for placeholder: ${match[1]}`)
          );
        }
      }
      return hasMatch ? processedLine.replace(/^#\s*/, "") : processedLine;
    })
    .join("\n");
  await fs.writeFile(options.outputPath, envData);
}

program
  .name("envValues")
  .version("0.1.0")
  .description(
    "Creates the .env.local file with the CloudFormation stack outputs"
  )
  .argument(
    "[samConfigEnv]",
    "The SAM environment to use to generate the config file",
    "default"
  )
  .option(
    "-t, --env-template <value>",
    "The path to the .env.template file.",
    "./.env.template"
  )
  .option(
    "-s, --sam-toml-config <value>",
    "The path to the samconfig toml file.",
    "../backend/samconfig.toml"
  )
  .option("-o, --output-path <value>", "The output file path.", "./.env.local")
  .action((samConfigEnv, options) => {
    run(samConfigEnv, options);
  });
program.parse();
