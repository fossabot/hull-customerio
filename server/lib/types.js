/* @flow */

export interface ILogger {
  log(message: ?any, ...optionalParams: any[]):void;
  info(message: ?any, ...optionalParams: any[]):void;
  warn(message: ?any, ...optionalParams: any[]):void;
  error(message: ?any, ...optionalParams: any[]):void;
  debug(message: ?any, ...optionalParams: any[]):void;
}

export interface IMetricsClient {
  increment(name: string, value: number): void;
  value(name: string, value: number): void;
}

export interface IServiceCredentials {
  username: string;
  password: string;
}

export interface IContext {
  ship: any;
  client: any;
  metric: IMetricsClient;
}
