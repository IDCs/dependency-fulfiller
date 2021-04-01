import * as React from 'react';
import { ControlLabel } from 'react-bootstrap';
import { withTranslation } from 'react-i18next';
import { connect } from 'react-redux';
import * as Redux from 'redux';
import { ComponentEx, More, Toggle, types, util } from 'vortex-api';

import { setAutoFulfillDependencies } from '../actions/settings';
import { DEP_MAN_SUFFIX } from '../common';

interface IConnectedProps {
  autoFulfill: boolean;
}

interface IActionProps {
  onSetAutoFulfillDependencies: (fulfill: boolean) => void;
}

type IProps = IActionProps & IConnectedProps;

class Settings extends ComponentEx<IProps, {}> {
  public render(): JSX.Element {
    const { t, autoFulfill } = this.props;

    return (
      <div>
        <ControlLabel>{t('Dependency Fulfillment')}</ControlLabel>
        <Toggle
          checked={autoFulfill}
          onToggle={this.toggle}
        >
          {t('Fulfill mod dependencies automatically on mod installation')}
          <More id='dep-fulfill-info' name='On Install Dependency Fulfiller'>
          {t('If checked, Vortex will search the new mod\'s installation folder for files with the '
            + '"{{suffix}}" suffix and attempt to install any mod dependencies defined in that '
            + 'file. (Obviously this will only work if the mod author included such a file with his '
            + 'mod in the first place)', { replace: { suffix: DEP_MAN_SUFFIX } })}
          </More>
        </Toggle>
      </div>
    );
  }

  private toggle = (enabled: boolean) => {
    const { onSetAutoFulfillDependencies } = this.props;
    onSetAutoFulfillDependencies(enabled);
  }
}

function mapStateToProps(state: types.IState): IConnectedProps {
  return {
    autoFulfill: util.getSafe(state, ['settings', 'interface', 'autofulfill'], false),
  };
}

function mapDispatchToProps(dispatch: Redux.Dispatch<any>): IActionProps {
  return {
    onSetAutoFulfillDependencies: (fulfill: boolean) =>
      dispatch(setAutoFulfillDependencies(fulfill)),
  };
}

export default withTranslation(['common', 'dependency-fulfiller'])(
  connect(mapStateToProps, mapDispatchToProps)(
    Settings) as any) as React.ComponentClass<{}>;
