/*
  Optional local question bank for file:// support.

  In production (http/https), ThinkRight loads questions from /data/*.json.
  If you want to run locally without a dev server, you can populate
  window.THINKRIGHT_QUESTION_BANK with subject arrays.
*/

window.THINKRIGHT_QUESTION_BANK = window.THINKRIGHT_QUESTION_BANK || {};
