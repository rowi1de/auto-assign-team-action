import * as core from "@actions/core";
import * as github from "@actions/github";

export async function run() {
  try {
    const repoToken = core.getInput("repo-token", { required: true }),
      issue: { owner: string; repo: string; number: number } =
        github.context.issue;
    core.setSecret(repoToken);

    const pickOneFromPersonsOrTeam: Boolean = Boolean(
      core.getInput("pick-one-from-persons-or-team") || false
    );

    if (issue == null || issue.number == null) {
      console.log("No pull request context, skipping");
      return;
    }

    //See https://octokit.github.io/rest.js/
    const client = github.getOctokit(repoToken);

    const includeDraft: Boolean = Boolean(
      core.getInput("include-draft") || false
    );
    const pull = await client.pulls.get({
      owner: issue.owner,
      repo: issue.repo,
      pull_number: issue.number,
    });

    //Skip DRAFT PRs
    if (pull.data.draft && !includeDraft) {
      console.log("Skipped: DRAFT Pull Request, not assigning PR.");
      return;
    }

    const skipWithNumberOfReviewers: number = Number(
      core.getInput("skip-with-manual-reviewers") || Number.MAX_VALUE
    );
    const numberOfReviewers = pull.data.requested_reviewers?.length || 0;
    if (numberOfReviewers >= skipWithNumberOfReviewers) {
      console.log(
        "Skipped: Already " +
          numberOfReviewers +
          " assigned reviewers, not assigning PR."
      );
      return;
    }

    const teams = core
      .getInput("teams")
      .split(",")
      .map((a) => a.trim());
    const persons = core
      .getInput("persons")
      .split(",")
      // filter out PR creator
      .filter((user) => user !== issue.owner)
      .map((a) => a.trim());

    if (teams.length == 0 && persons.length == 0) {
      core.setFailed("Please specify 'teams' and/or 'persons'");
      return;
    }

    if (persons.length > 0) {
      console.log("Picking from: " + persons);
      const reviewers = pickOneFromPersonsOrTeam
        ? [persons[Math.floor(Math.random() * persons.length)]]
        : persons;
      console.log("Adding person(s): " + reviewers);

      const personResponse = await client.pulls.requestReviewers({
        owner: issue.owner,
        repo: issue.repo,
        pull_number: issue.number,
        reviewers: reviewers,
      });
      console.log(
        "Request Status:" +
          personResponse.status +
          ", Persons: " +
          personResponse?.data?.requested_reviewers
            ?.map((r) => r.login)
            .join(",")
      );
    }

    // Making sure that org is provided if user turns on pick-one-from-persons-or-team option and to use teams
    const org: string = core.getInput("org");
    if (pickOneFromPersonsOrTeam && teams.length > 0 && org == null) {
      core.setFailed(
        "Please specify 'org' if you want to pick one from persons or teams and use Teams"
      );
      return;
    }

    if (teams.length > 0) {
      if (pickOneFromPersonsOrTeam) {
        // Picking out 1 person from first team listed
        console.log("Selecting from first team provided: " + teams[0]);
        const members = await client.teams.listMembersInOrg({
          org: org,
          team_slug: teams[0],
        });
        console.log(
          "Request Status for getting team members:" + members.status
        );
        console.log("DEBUG LINES");
        console.log(members.data);
        console.log({ issue });
        // filter out PR creator
        const eligibleMembers = members.data
          .filter((user) => user.login !== issue.owner)
          .map((a) => a.login);

        console.log({ eligibleMembers });

        const person = [
          eligibleMembers[Math.floor(Math.random() * eligibleMembers.length)],
        ];
        const personResponse = await client.pulls.requestReviewers({
          owner: issue.owner,
          repo: issue.repo,
          pull_number: issue.number,
          reviewers: person,
        });

        console.log(
          "Request Status:" +
            personResponse.status +
            ", Person from First Team: " +
            personResponse?.data?.requested_reviewers
              ?.map((r) => r.login)
              .join(",")
        );
      } else {
        console.log("Adding teams: " + teams);
        const teamResponse = await client.pulls.requestReviewers({
          owner: issue.owner,
          repo: issue.repo,
          pull_number: issue.number,
          team_reviewers: teams,
        });
        console.log(
          "Request Status:" +
            teamResponse.status +
            ", Teams: " +
            teamResponse?.data?.requested_teams?.map((t) => t.slug).join(",")
        );
      }
    }
  } catch (error) {
    core.setFailed(error.message);
    throw error;
  }
}

run();
