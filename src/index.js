const express = require('express');
const cors = require('cors');
const fs = require('fs');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

const C = require('./constants');
const USERNAME_SELECTOR = '#session_key';
const PASSWORD_SELECTOR = '#session_password';
const CTA_SELECTOR = '.sign-in-form__submit-button';

const LOADMORE = '.comments-comments-list__load-more-comments-button';

const REACTIONS = '.social-details-social-counts__reactions-count';
const scrollable_section = '.social-details-reactors-modal__content';
const file = `RESULTS.CSV`;

async function startBrowser() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  return { browser, page };
}

async function closeBrowser(browser) {
  return browser.close();
}

async function login(url, page) {
  await page.goto(url);
  await page.click(USERNAME_SELECTOR);
  await page.keyboard.type(C.username);
  await page.click(PASSWORD_SELECTOR);
  await page.keyboard.type(C.password);
  await page.click(CTA_SELECTOR);
  await page.waitForNavigation();
}

const objectToCsv = function (data) {
  let csvRows = [];
  /* Get headers as every csv data format 
    has header (head means column name)
    so objects key is nothing but column name 
    for csv data using Object.key() function.
    We fetch key of object as column name for 
    csv */
  const headers = Object.keys(data[0]);

  /* Using push() method we push fetched 
        data into csvRows[] array */
  csvRows.push(headers.join(','));

  // Loop to get value of each objects key
  for (const row of data) {
    const values = headers.map((header) => {
      const val = row[header];
      return `"${val}"`;
    });
    csvRows.push(values.join(','));
  }
  return csvRows.join('\n');
};

const getJob = async (url, page) => {
  await page.goto('https://www.' + url);
  const n = await page.$(
    '.inline-show-more-text--is-collapsed-with-line-clamp'
  );
  const t = await (await n.getProperty('textContent')).jsonValue();
  return t.trim();
};

async function exportComments(page, URL, NotAddJobs) {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.resourceType() === 'image') request.abort();
    else request.continue();
  });

  // getting comments count
  {
    // let cmnt_count = parseInt(await page.waitForSelector('.social-details-social-counts__comments',{ visible: true })
    // 	.then(async () => {
    // 		let el = '.social-details-social-counts__comments';
    // 		const text = await page.$eval(el, element => element.textContent)
    // 		return text.match(/\d+/)[0];
    // 	}));
    // console.log(cmnt_count);
    //scrapping comments
  }

  for (let i = 0; i < 100000; i++) {
    try {
      await page.waitForSelector(LOADMORE, { visible: true, timeout: 2000 });
      await page.click(LOADMORE);
    } catch (error) {
      console.error(error);
      break;
    }
  }

  const pageData = await page.evaluate(() => {
    return {
      html: document.documentElement.innerHTML,
    };
  });

  const comments = [];
  const $ = cheerio.load(pageData.html);

  let comnt,
    link = '';
  $('.comments-post-meta__name-text').each(function (index, element) {
    comnt = $(this).text();
    link = $(this).parent().parent().parent().attr('href');
    comments.push(
      NotAddJobs
        ? {
            name: comnt ? comnt.trim() : '--',
            profile: link ? 'linkedin.com' + link : '--',
          }
        : {
            name: comnt ? comnt.trim() : '--',
            profile: link ? 'linkedin.com' + link : '--',
            job: '',
          }
    );
  });

  if (!NotAddJobs) {
    try {
      for (let comnt of comments) {
        if (comnt.profile != '--') {
          try {
            comnt.job = await getJob(comnt.profile, page);
          } catch (e) {
            console.log(e);
          }
        }
      }
    } catch (e) {
      console.log('error with getting jobs');
      console.log(e);
    }
  }

  const csvData = comments.length ? objectToCsv(comments) : ',\tno comments\t,';
  return csvData;
}

async function exportReactions(page, URL, NotAddJobs) {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.setRequestInterception(true);
  try {
    await page.waitForSelector(REACTIONS, { visible: true, timeout: 20000 });
    await page.click(REACTIONS);
  } catch (error) {
    console.error(error);
  }

  let pageData2 = await page.evaluate(() => {
    return {
      html: document.documentElement.innerHTML,
    };
  });
  let $ = cheerio.load(pageData2.html);
  let reactn_count;
  $('.social-details-reactors-tab__reaction-tab').each(function (
    index,
    element
  ) {
    reactn_count = parseInt($(this).children().last().text().trim());
  });
  console.log(reactn_count);

  //SCROLLING SECTION DOWN

  let height = 476;
  let reps = Math.ceil(reactn_count / 10);
  for (let i = 0; i < reps * 2; i++) {
    await page
      .waitForSelector(scrollable_section, { visible: true, timeout: 10000 })
      .then(async () => {});
    try {
      await page.evaluate(
        (selector, height) => {
          const scrollableSection = document.querySelector(selector);
          // console.log(scrollableSection.offsetHeight);
          scrollableSection.scrollTop = height;
        },
        scrollable_section,
        height
      );
      height += 476 * 2;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (e) {
      console.log(e);
    }
  }

  const pageData = await page.evaluate(() => {
    return {
      html: document.documentElement.innerHTML,
    };
  });

  const reactions = [];
  $ = cheerio.load(pageData.html);

  $('.artdeco-entity-lockup__content').each(function (index, element) {
    let like = $(this).children().first().children().first().text();
    let link = $(this).parent().parent().attr('href');
    let job = $(this).children().last().text();

    reactions.push(
      NotAddJobs
        ? {
            name: like ? like.trim() : '--',
            profile: link ? link.trim().substring(12).split('?')[0] : '--',
          }
        : {
            name: like ? like.trim() : '--',
            profile: link ? link.trim().substring(12).split('?')[0] : '--',
            job: job && link && job.trim().length < 50 ? job.trim() : '--',
          }
    );
  });

  //MAKING REACTION JOBS FANCIER
  {
    // console.log(reactions.length);
    // try {
    //   for (let r of reactions) {
    //     if (r.profile != '--') {
    //       try {
    //         r.job = await getJob(r.profile, page);
    //         console.log(r.job);
    //       } catch (e) {
    //         console.log(e);
    //       }
    //     }
    //   }
    // } catch (e) {
    //   console.log('error with getting jobs');
    //   console.log(e);
    // }
  }
  console.log(reactions.length);

  const csvData = reactions.length
    ? objectToCsv(reactions)
    : ',\tno reactions\t';
  return csvData;
}

const app = express();
const port = process.env.PORT || 8080;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cors());

let links = [{ url: 'linkedin.com', type: 'both', checked: [false] }];

app.get('/comments', (req, res) => {
  try {
    res.download('././RESULTS.CSV', file, function (err) {
      if (err) {
        console.log(err);
      } else {
        // decrement a download credit, etc.
      }
    });
  } catch (e) {
    console.log(e);
  }
});

const writeToCsv = (comntscsv, reactionscsv, i) => {
  ind = i + 1;
  if (ind == 1) {
    fs.writeFileSync(file, `\t\t\t,POST-${ind},\t\t\t`);
  } else {
    fs.appendFileSync(file, `\t\t\t,POST-${ind},\t\t\t`);
  }
  if (comntscsv != '') {
    fs.appendFileSync(file, '\n,\t\t\tCOMMENTS\t\t\t,\n');
    fs.appendFileSync(file, comntscsv);
  }
  if (reactionscsv != '') {
    fs.appendFileSync(file, '\n,\t\t\tREACTIONS\t\t\t,\n');
    fs.appendFileSync(file, reactionscsv);
  }
  fs.appendFileSync(file, '\n');
};
app.put('/comments', async (req, res) => {
  links[0] = req.body;
  console.log('message received');
  const { browser, page } = await startBrowser();

  try {
    await login('https://www.linkedin.com/', page);
    page.setViewport({ width: 1366, height: 768 });
  } catch (e) {
    console.log(e);
  }

  let comntscsv = '';
  let reactionscsv = '';
  try {
    for (let i = 0; i < links[0].url.length; i++) {
      if (links[0].type != 'reactions') {
        try {
          comntscsv = await exportComments(
            page,
            links[0].url[i],
            links[0].checked[i]
          );
        } catch {}
      }
      if (links[0].type != 'comments') {
        try {
          reactionscsv = await exportReactions(
            page,
            links[0].url[i],
            links[0].checked[i]
          );
        } catch {}
      }
      writeToCsv(comntscsv, reactionscsv, i);
    }
  } catch (e) {
    console.log(e);
  }
  await closeBrowser(browser);
  res.status(200).send();
});

app.listen(port, () => {
  console.log('Server st');
});
